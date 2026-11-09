-- Lot numbers are labels; order/material scopes and UUID relations are preserved.
-- This migration does not delete or merge business data.
begin;
alter table public.lots drop constraint if exists lots_lot_no_key;
alter table public.inventory_items drop constraint if exists inventory_items_product_name_lot_no_key;
create unique index if not exists inventory_items_lot_identity_idx
  on public.inventory_items(lot_id) where lot_id is not null;
create unique index if not exists inventory_items_legacy_product_lot_idx
  on public.inventory_items((coalesce('id:'||product_id::text,'code:'||nullif(btrim(product_code),''),'name:'||product_name)),lot_no)
  where lot_id is null;
create unique index if not exists lots_standalone_product_lot_material_idx
  on public.lots((coalesce('id:'||product_id::text,'code:'||nullif(btrim(product_code),''),'name:'||product_name)),lot_no,coalesce(material_lot_no,''))
  where post_id is null;

create or replace function app_private.same_lot_product(a_id uuid,a_code text,a_name text,b_id uuid,b_code text,b_name text)
returns boolean language sql immutable set search_path='' as $body$
 select coalesce(case
   when a_id is not null and b_id is not null then a_id=b_id
   when nullif(btrim(a_code),'') is not null and nullif(btrim(b_code),'') is not null then a_code=b_code
   else nullif(btrim(a_name),'')=nullif(btrim(b_name),'') end,false)
$body$;
create or replace function app_private.inventory_matches_lot(i public.inventory_items,l public.lots)
returns boolean language sql immutable set search_path='' as $body$
 select coalesce(case when i.lot_id is not null then i.lot_id=l.id else
   i.lot_no=l.lot_no and app_private.same_lot_product(i.product_id,i.product_code,i.product_name,l.product_id,l.product_code,l.product_name) end,false)
$body$;
revoke all on function app_private.same_lot_product(uuid,text,text,uuid,text,text),app_private.inventory_matches_lot(public.inventory_items,public.lots) from public,anon,authenticated,service_role;

-- Master edits must not relabel stock belonging to another product or lot.
create or replace function app_private.guard_inventory_lot_identity() returns trigger
language plpgsql security definer set search_path='' as $body$
declare l public.lots;
begin
 if new.lot_id is null then return new; end if;
 select * into l from public.lots where id=new.lot_id;
 if not found or new.lot_no is distinct from l.lot_no or not app_private.same_lot_product(new.product_id,new.product_code,new.product_name,l.product_id,l.product_code,l.product_name) then
   raise exception '在庫の製品・ロットNoが紐づく製造ロットと一致しません';
 end if;
 return new;
end $body$;
revoke all on function app_private.guard_inventory_lot_identity() from public,anon,authenticated,service_role;
drop trigger if exists zz_inventory_lot_identity on public.inventory_items;
create trigger zz_inventory_lot_identity before insert or update of lot_id,lot_no,product_id,product_code,product_name on public.inventory_items
for each row execute function app_private.guard_inventory_lot_identity();

CREATE OR REPLACE FUNCTION public.register_manufacturing_lot_result(p_order_process_id uuid, p_schedule_id uuid, p_date date, p_amount integer, p_lot_no text, p_material_lot_no text, p_idempotency_key text)
 RETURNS TABLE(production_result_id uuid, lot_id uuid, moved_to_order_process_id uuid, movement_history_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  target_process order_processes%rowtype;
  target_post posts%rowtype;
  target_lot lots%rowtype;
  next_process order_processes%rowtype;
  target_inventory inventory_items%rowtype;
  inserted_result_id uuid;
  inserted_history_id uuid;
  before_to_quantity integer := 0;
  after_to_quantity integer := 0;
  trimmed_lot_no text;
  trimmed_material_lot_no text;
  existing_result public.production_results%rowtype;
  selected_schedule public.production_schedules%rowtype;
begin perform app_private.assert_access('f');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  trimmed_lot_no := nullif(trim(coalesce(p_lot_no, '')), '');
  trimmed_material_lot_no := nullif(trim(coalesce(p_material_lot_no, '')), '');

  if trimmed_lot_no is null then
    raise exception 'Lot No is required';
  end if;

  if nullif(btrim(p_idempotency_key),'') is null then
    raise exception '登録処理キーを指定してください';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  if p_idempotency_key is not null then
    select
      pth.source_result_id,
      pth.lot_id,
      pth.to_order_process_id,
      pth.id
    into
      production_result_id,
      lot_id,
      moved_to_order_process_id,
      movement_history_id
    from process_transfer_history pth
    where pth.idempotency_key = p_idempotency_key
    limit 1;

    if found then
      select * into existing_result from production_results where id=production_result_id;
      if not found or existing_result.order_process_id is distinct from p_order_process_id
        or existing_result.schedule_id is distinct from p_schedule_id
        or existing_result.date is distinct from p_date or existing_result.amount is distinct from p_amount
        or not exists(select 1 from lots l where l.id=existing_result.lot_id and l.lot_no=trimmed_lot_no
          and coalesce(l.material_lot_no,'')=coalesce(trimmed_material_lot_no,'')) then
        raise exception '同じ処理キーで異なる製造実績は登録できません';
      end if;
      return next;
      return;
    end if;
  end if;

  select *
  into target_process
  from order_processes
  where id = p_order_process_id
  for update;

  if not found then
    raise exception 'Order process was not found';
  end if;

  if target_process.locked then
    raise exception 'Locked order process cannot be changed';
  end if;

  if target_process.process_order <> 1 then
    raise exception 'Manufacturing lot registration must start from the first process';
  end if;

  select *
  into target_post
  from posts
  where id = target_process.post_id
  for update;

  if not found then
    raise exception 'Order was not found';
  end if;
  if not app_private.same_lot_product(target_process.product_id,target_process.product_code,target_process.product_name,
    target_post.product_id,target_post.product_code,target_post.product_name) then
    raise exception '製造工程と注番の製品が一致しません';
  end if;
  if p_schedule_id is not null then
    select * into selected_schedule from production_schedules where id=p_schedule_id for update;
    if not found then raise exception '製造予定が見つかりません'; end if;
    if (selected_schedule.post_id is not null and selected_schedule.post_id<>target_post.id)
      or (selected_schedule.post_id is null and (nullif(selected_schedule.order_no,'') is null or selected_schedule.order_no is distinct from target_post.order_no))
      or not app_private.same_lot_product(selected_schedule.product_id,null,selected_schedule.product_name,
        target_post.product_id,target_post.product_code,target_post.product_name) then
      raise exception '製造予定と注番の製品が一致しません';
    end if;
  end if;

  select *
  into target_lot
  from lots
  where post_id = target_process.post_id
    and lot_no = trimmed_lot_no
    and coalesce(material_lot_no, '') = coalesce(trimmed_material_lot_no, '')
    and coalesce(deleted, false) = false
  for update;

  if not found then
    insert into lots (
      post_id,
      order_no,
      product_id,
      customer_id,
      product_code,
      product_name,
      customer_name,
      lot_no,
      material_lot_no,
      lot_type,
      quantity,
      measured_amount,
      status,
      measured_at,
      created_at,
      updated_at
    ) values (
      target_process.post_id,
      target_process.order_no,
      target_process.product_id,
      target_process.customer_id,
      target_process.product_code,
      target_process.product_name,
      target_process.customer_name,
      trimmed_lot_no,
      trimmed_material_lot_no,
      'normal',
      p_amount,
      p_amount,
      'in_process',
      p_date,
      now(),
      now()
    )
    returning * into target_lot;
  else
    update lots
    set quantity = coalesce(quantity, 0) + p_amount,
        measured_amount = coalesce(measured_amount, 0) + p_amount,
        status = 'in_process',
        updated_at = now()
    where id = target_lot.id
    returning * into target_lot;
  end if;

  insert into production_results (
    schedule_id,
    post_id,
    order_process_id,
    lot_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values (
    p_schedule_id,
    target_process.post_id,
    target_process.id,
    target_lot.id,
    target_process.id::text,
    target_process.process_name,
    p_date,
    p_amount,
    now()
  )
  returning id into inserted_result_id;

  update order_processes
  set completed_amount = coalesce(completed_amount, 0) + p_amount,
      completed_date = greatest(completed_date, p_date),
      updated_at = now()
  where id = target_process.id;

  select *
  into next_process
  from order_processes
  where post_id = target_process.post_id
    and process_order > target_process.process_order
  order by process_order asc
  limit 1
  for update;

  if found then
    select coalesce(quantity, 0)
    into before_to_quantity
    from lot_process_balance
    where lot_process_balance.lot_id = target_lot.id
      and lot_process_balance.order_process_id = next_process.id
    for update;

    before_to_quantity := coalesce(before_to_quantity, 0);
    after_to_quantity := before_to_quantity + p_amount;

    update lot_process_balance
    set quantity = after_to_quantity,
        source_result_id = inserted_result_id,
        process_name = next_process.process_name,
        process_order = next_process.process_order,
        updated_at = now()
    where lot_process_balance.lot_id = target_lot.id
      and lot_process_balance.order_process_id = next_process.id;

    if not found then
      insert into lot_process_balance (
        post_id,
        order_process_id,
        lot_id,
        process_name,
        process_order,
        quantity,
        source_result_id,
        created_at,
        updated_at
      ) values (
        target_process.post_id,
        next_process.id,
        target_lot.id,
        next_process.process_name,
        next_process.process_order,
        p_amount,
        inserted_result_id,
        now(),
        now()
      );
    end if;
  else
    select *
    into target_inventory
    from inventory_items
    where inventory_items.lot_id = target_lot.id
      and (
        (target_process.product_id is not null and inventory_items.product_id = target_process.product_id)
        or inventory_items.product_code = target_process.product_code
      )
    order by updated_at asc
    limit 1
    for update;

    if found then
      update inventory_items
      set current_stock = coalesce(current_stock, 0) + p_amount,
          updated_at = now()
      where id = target_inventory.id;
    else
      insert into inventory_items (
        lot_id,
        product_id,
        product_code,
        product_name,
        lot_no,
        current_stock,
        allocated_stock,
        updated_at
      ) values (
        target_lot.id,
        target_process.product_id,
        target_process.product_code,
        target_process.product_name,
        target_lot.lot_no,
        p_amount,
        0,
        now()
      );
    end if;

    update lots
    set inventory_amount = coalesce(inventory_amount, 0) + p_amount,
        status = 'stocked',
        updated_at = now()
    where id = target_lot.id;
  end if;

  insert into process_transfer_history (
    post_id,
    lot_id,
    from_order_process_id,
    to_order_process_id,
    from_process_name,
    to_process_name,
    from_process_order,
    to_process_order,
    quantity,
    movement_type,
    source_result_id,
    before_from_quantity,
    after_from_quantity,
    before_to_quantity,
    after_to_quantity,
    reason,
    idempotency_key,
    created_at
  ) values (
    target_process.post_id,
    target_lot.id,
    null,
    next_process.id,
    null,
    next_process.process_name,
    null,
    next_process.process_order,
    p_amount,
    case when next_process.id is null then 'stock_in' else 'manufacturing_result' end,
    inserted_result_id,
    null,
    null,
    before_to_quantity,
    after_to_quantity,
    'Manufacturing result registered and moved automatically',
    p_idempotency_key,
    now()
  )
  returning id into inserted_history_id;

  -- Schedule and lot/result must commit together; retries cannot double count.
  if p_schedule_id is not null then
    update production_schedules set press_completed_amount=coalesce(press_completed_amount,0)+p_amount,
      press_completed_date=greatest(press_completed_date,p_date),updated_at=now() where id=p_schedule_id;
  end if;
  production_result_id := inserted_result_id;
  lot_id := target_lot.id;
  moved_to_order_process_id := next_process.id;
  movement_history_id := inserted_history_id;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_order_process_result(p_order_process_id uuid, p_schedule_id uuid, p_date date, p_amount integer, p_lot_id uuid, p_allow_overproduction boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  target_process order_processes%rowtype;
  target_post posts%rowtype;
  target_inventory inventory_items%rowtype;
  target_lot lots%rowtype;
  previous_completed integer;
  allowance_completed integer;
  new_completed integer;
  is_outsourced boolean;
  is_packaging boolean;
  target_lot_no text;
  inserted_result_id uuid;
begin perform app_private.assert_access('f');
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select *
  into target_process
  from order_processes
  where id = p_order_process_id
  for update;

  if not found then
    raise exception 'Order process was not found';
  end if;

  if target_process.locked then
    raise exception 'Locked order process cannot be changed';
  end if;

  new_completed := coalesce(target_process.completed_amount, 0) + p_amount;

  if target_process.process_order = 1 then
    if p_allow_overproduction then
      previous_completed := greatest(
        coalesce(target_process.planned_amount, 0),
        new_completed
      );
    else
      previous_completed := coalesce(target_process.planned_amount, 0);
    end if;
  else
    select coalesce(completed_amount, 0)
    into previous_completed
    from order_processes
    where post_id = target_process.post_id
      and process_order < target_process.process_order
    order by process_order desc
    limit 1;

    previous_completed := coalesce(previous_completed, 0);
  end if;

  is_outsourced :=
    target_process.subcontractor_id is not null
    or target_process.outsource_sent_date is not null
    or target_process.outsource_returned_date is not null
    or target_process.outsource_status in ('sent', 'returned');

  if is_outsourced then
    allowance_completed := greatest(
      previous_completed,
      coalesce(target_process.completed_amount, 0),
      coalesce(target_process.planned_amount, 0)
    );
  else
    allowance_completed := previous_completed;
  end if;

  if new_completed > allowance_completed then
    raise exception 'Amount exceeds allowed quantity. Remaining allowance is %',
      greatest(allowance_completed - coalesce(target_process.completed_amount, 0), 0);
  end if;

  is_packaging :=
    coalesce(target_process.process_name, '') like '%梱包%'
    or coalesce(target_process.process_name, '') like '%包装%';

  if is_packaging then
    if p_lot_id is null then raise exception '梱包登録には製造ロットを選択してください'; end if;
    select *
    into target_post
    from posts
    where id = target_process.post_id
    for update;

    if not found then
      raise exception 'Order was not found';
    end if;

    if p_lot_id is not null then
      select *
      into target_lot
      from lots
      where id = p_lot_id
      for update;

      if not found then
        raise exception 'Selected lot was not found';
      end if;

      if target_lot.deleted is true then raise exception '削除済みロットは選択できません'; end if;
      if target_lot.post_id is distinct from target_process.post_id then
        raise exception 'Selected lot does not belong to the target order';
      end if;

      if p_amount > greatest(
        coalesce(target_lot.measured_amount, 0) - coalesce(target_lot.packaged_amount, 0),
        0
      ) then
        raise exception 'Amount exceeds lot packaging allowance. Remaining allowance is %',
          greatest(
            coalesce(target_lot.measured_amount, 0) - coalesce(target_lot.packaged_amount, 0),
            0
          );
      end if;

      target_lot_no := nullif(trim(coalesce(target_lot.lot_no, '')), '');
    else
      target_lot_no := nullif(trim(coalesce(target_post.lot_no, '')), '');
    end if;

    if target_lot_no is null then
      raise exception 'Lot No is required before packaging inventory registration';
    end if;
  end if;

  insert into production_results (
    schedule_id,
    post_id,
    order_process_id,
    lot_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values (
    p_schedule_id,
    target_process.post_id,
    target_process.id,
    p_lot_id,
    target_process.id::text,
    target_process.process_name,
    p_date,
    p_amount,
    now()
  )
  returning id into inserted_result_id;

  update order_processes
  set completed_amount = new_completed,
      completed_date = p_date,
      updated_at = now()
  where id = target_process.id;

  if is_packaging then
    select *
    into target_inventory
    from inventory_items
    where (
        (p_lot_id is not null and lot_id = p_lot_id)
        or (p_lot_id is null and lot_no = target_lot_no)
      )
      and (
        (target_process.product_id is not null and product_id = target_process.product_id)
        or product_code = target_process.product_code
      )
    order by updated_at asc
    limit 1
    for update;

    if found then
      update inventory_items
      set current_stock = coalesce(current_stock, 0) + p_amount,
          lot_id = coalesce(lot_id, p_lot_id),
          updated_at = now()
      where id = target_inventory.id;
    else
      insert into inventory_items (
        lot_id,
        product_id,
        product_code,
        product_name,
        lot_no,
        current_stock,
        allocated_stock,
        updated_at
      ) values (
        p_lot_id,
        target_process.product_id,
        target_process.product_code,
        target_process.product_name,
        target_lot_no,
        p_amount,
        0,
        now()
      );
    end if;

    if p_lot_id is not null then
      update lots
      set packaged_amount = coalesce(packaged_amount, 0) + p_amount,
          inventory_amount = coalesce(inventory_amount, 0) + p_amount,
          packaged_at = p_date,
          status = case
            when coalesce(packaged_amount, 0) + p_amount >= coalesce(measured_amount, 0)
              then 'stocked'
            else 'packaging'
          end,
          updated_at = now()
      where id = p_lot_id;
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.history_eligibility(p_post uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.posts; finish timestamptz; yr integer; reason text; shipped bigint;
begin
 select * into p from public.posts where id=p_post;
 if not found then return jsonb_build_object('eligible',false,'reason','注文がありません'); end if;
 select detail_years into yr from public.history_retention_settings where id;
 select coalesce(sum(quantity),0),max(greatest(created_at,updated_at,delivery_date::timestamptz,scheduled_date::timestamptz)) into shipped,finish
 from public.shipments where (post_id=p.id or (post_id is null and order_no=p.order_no)) and not coalesce(cancelled,false);
 if coalesce(p.delete,false) then reason:='削除扱いの注文は対象外です';
 elsif coalesce(p.order_amount,0)<=0 or shipped<p.order_amount then reason:='注残があります';
 elsif (select count(*) from public.posts where order_no=p.order_no)>1 then reason:='注番が重複しています';
 elsif exists(select 1 from public.history_exports where post_id=p.id and state='archived') then reason:='詳細履歴は退避済みです';
 elsif exists(select 1 from public.ai_prediction_runs where status='running') then reason:='AI更新中です';
 elsif exists(select 1 from public.order_processes where post_id=p.id and (coalesce(completed_amount,0)<coalesce(planned_amount,0) or (coalesce(planned_amount,0)>0 and coalesce(outsource_returned_date,completed_date) is null) or (outsource_sent_date is not null and outsource_returned_date is null))) then reason:='未完了または完了日不明の工程があります';
 elsif exists(select 1 from public.outsource_remainder_schedules r join public.order_processes o on o.id=r.order_process_id where o.post_id=p.id and not r.cancelled and (r.returned_date is null or r.moved_amount<r.quantity)) then reason:='未完了の外注分割日程があります';
 elsif exists(select 1 from public.lot_process_balance where post_id=p.id and quantity>0) then reason:='工程の残数量があります';
 elsif exists(select 1 from public.inventory_allocations a where (a.post_id=p.id or a.lot_id in(select id from public.lots where post_id=p.id)) and a.allocated_amount>a.shipped_amount) then reason:='未消化の在庫引当があります';
 elsif exists(select 1 from public.inventory_items i where exists(select 1 from public.lots l where l.post_id=p.id and app_private.inventory_matches_lot(i,l)) and (i.current_stock<>0 or i.allocated_stock<>0)) then reason:='ロットに在庫または引当残があります';
 elsif exists(select 1 from public.lots where post_id=p.id and (coalesce(inventory_amount,0)>0 or coalesce(packaged_amount,0)>coalesce(shipped_amount,0))) then reason:='ロットの残数量があります';
 elsif exists(select 1 from public.shipments s where s.post_id is distinct from p.id and s.lot_id in(select id from public.lots where post_id=p.id)) or exists(select 1 from public.inventory_allocations a where a.post_id is distinct from p.id and a.lot_id in(select id from public.lots where post_id=p.id)) then reason:='他注文からロットが参照されています';
 elsif exists(select 1 from public.production_results r where r.order_process_id in(select id from public.order_processes where post_id=p.id) and r.post_id is distinct from p.id) then reason:='工程と実績の注文が一致しません';
 elsif exists(select 1 from public.production_results r where r.post_id=p.id and r.lot_id is not null and not exists(select 1 from public.lots l where l.id=r.lot_id and l.post_id=p.id)) then reason:='他注文のロットに紐づく実績があります';
 elsif exists(select 1 from public.production_results r where r.post_id=p.id and r.order_process_id is null) then reason:='工程未紐付けの実績があります';
 elsif exists(select 1 from public.production_results r where r.post_id=p.id and coalesce(r.amount,0)>0 and (r.date is null or r.date>(now() at time zone 'Asia/Tokyo')::date)) then reason:='日付不明・未来の実績があります';
 end if;
 select greatest(finish,p.created_at,p.updated_at,
  (select max(greatest(completed_date::timestamptz,outsource_returned_date::timestamptz,updated_at)) from public.order_processes where post_id=p.id),
  (select max(greatest(r.returned_date::timestamptz,r.updated_at)) from public.outsource_remainder_schedules r join public.order_processes o on o.id=r.order_process_id where o.post_id=p.id),
  (select max(greatest(date::timestamptz,created_at)) from public.production_results where post_id=p.id),
  (select max(updated_at) from public.lots where post_id=p.id),
  (select max(created_at) from public.process_transfer_history where post_id=p.id)) into finish;
 if reason is null and (finish is null or finish>now()) then reason:='業務終了日が不明または未来です'; end if;
 if reason is null and finish>now()-make_interval(years=>yr) then reason:='保存期間内です'; end if;
 return jsonb_build_object('post_id',p.id,'order_no',p.order_no,'product_name',p.product_name,'finished_at',finish,'eligible',reason is null,'reason',coalesce(reason,'削除対象'));
end $function$;

CREATE OR REPLACE FUNCTION app_private.guard_archived_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row_data jsonb; post_key uuid;
begin
 row_data:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if TG_TABLE_NAME='posts' then post_key:=(row_data->>'id')::uuid;
 elsif TG_TABLE_NAME='outsource_remainder_schedules' then select post_id into post_key from public.order_processes where id=(row_data->>'order_process_id')::uuid;
 elsif TG_TABLE_NAME='inventory_items' then select post_id into post_key from public.lots where id=(row_data->>'lot_id')::uuid;
 else post_key:=(row_data->>'post_id')::uuid; end if;
 if post_key is null and row_data->>'order_no' is not null then select id into post_key from public.posts where order_no=row_data->>'order_no' limit 1; end if;
 if TG_TABLE_NAME='inventory_items' then
   if exists(select 1 from public.lots l join public.history_exports e on e.post_id=l.post_id and e.state='archived'
     where app_private.inventory_matches_lot(jsonb_populate_record(null::public.inventory_items,row_data),l)) then
     raise exception '退避済みロットの在庫を変更できません';
   end if;
   if TG_OP<>'INSERT' then
     if exists(select 1 from public.lots l join public.history_exports e on e.post_id=l.post_id and e.state='archived'
       where app_private.inventory_matches_lot(jsonb_populate_record(null::public.inventory_items,to_jsonb(old)),l)) then
       raise exception '退避済みロットの在庫を変更できません';
     end if;
   end if;
 end if;
 if exists(select 1 from public.lots l join public.history_exports e on e.post_id=l.post_id and e.state='archived' where l.id=(row_data->>'lot_id')::uuid or (TG_OP<>'INSERT' and l.id=(to_jsonb(old)->>'lot_id')::uuid)) then raise exception '退避済みロットの履歴を変更できません'; end if;
 if exists(select 1 from public.order_processes o join public.history_exports e on e.post_id=o.post_id and e.state='archived' where o.id=(row_data->>'order_process_id')::uuid or (TG_OP<>'INSERT' and o.id=(to_jsonb(old)->>'order_process_id')::uuid)) then raise exception '退避済み工程の履歴を変更できません'; end if;
 if exists(select 1 from public.history_exports where post_id=post_key and state='archived') then raise exception '詳細履歴を退避済みです。履歴管理マスタで復元してから変更してください'; end if;
 if TG_OP<>'INSERT' and TG_TABLE_NAME<>'posts' and (to_jsonb(old)->>'post_id') is distinct from (row_data->>'post_id') then
  if exists(select 1 from public.history_exports where post_id=(to_jsonb(old)->>'post_id')::uuid and state='archived') then raise exception '退避済み注文の関連を変更できません'; end if;
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $function$;

create or replace function public.deduct_inventory(p_product_code text,p_lot_no text,p_quantity integer) returns void
language plpgsql set search_path=public,pg_temp as $body$
declare ids uuid[]; target_id uuid; target_lot uuid;
begin
 perform app_private.assert_access(true);
 if p_quantity is null or p_quantity<=0 then raise exception '数量は1以上で指定してください'; end if;
 select array_agg(x.id) into ids from (select id from public.inventory_items
   where product_code=p_product_code and lot_no=p_lot_no order by id for update) x;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception '製品番号とロットNoだけでは在庫を一意に特定できません。ロットを選択してください';
 end if;
 target_id:=ids[1];
 update public.inventory_items set current_stock=current_stock-p_quantity,updated_at=now()
   where id=target_id and current_stock-coalesce(allocated_stock,0)>=p_quantity returning lot_id into target_lot;
 if not found then raise exception '出荷可能な在庫数が不足しています'; end if;
 if target_lot is not null then
   update public.lots set inventory_amount=(select coalesce(sum(current_stock),0) from public.inventory_items where lot_id=target_lot),updated_at=now() where id=target_lot;
 end if;
end $body$;

-- Append the confirmed lot UUID without changing existing view column order or RLS behavior.
create or replace view public.v_production_results_with_master with(security_invoker=true) as
select prr.id,prr.post_id,p.order_no,prr.schedule_id,prr.order_process_id,op.process_order,
  coalesce(op.process_name,prr.process_name) as process_name,op.product_id,
  coalesce(pm.product_code,op.product_code,p.product_code) as product_code,
  coalesce(pm.product_name,op.product_name,p.product_name) as product_name,op.customer_id,
  coalesce(cm.customer_name,op.customer_name,p.customer_name) as customer_name,
  prr.date,prr.amount,prr.created_at,prr.lot_id
from public.production_results prr
left join public.posts p on p.id=prr.post_id
left join public.order_processes op on op.id=prr.order_process_id
left join public.product_master pm on pm.id=coalesce(op.product_id,p.product_id)
left join public.customer_master cm on cm.id=coalesce(op.customer_id,p.customer_id);

-- Preserve legacy cancellations, but never guess among multiple same-number lots.
CREATE OR REPLACE FUNCTION public.cancel_shipment_legacy(p_shipment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_shipment record;
  v_lot record;
  v_inventory record;
  v_allocation record;
  v_remaining integer := 0;
  v_restore integer := 0;
  v_allocated_restore_total integer := 0;
  v_last_shipped_at date;
  lot_candidates uuid[];
begin
  select *
    into v_shipment
    from shipments
   where id = p_shipment_id
   for update;

  if not found then
    raise exception '出荷履歴が見つかりません';
  end if;

  if coalesce(v_shipment.cancelled, false) then
    raise exception 'この出荷履歴はすでに取り消されています';
  end if;

  if coalesce(v_shipment.quantity, 0) <= 0 then
    raise exception '取消可能な出荷数がありません';
  end if;

  if v_shipment.lot_id is not null then
    select *
      into v_lot
      from lots
     where id = v_shipment.lot_id
     for update;
  else
    select array_agg(x.id) into lot_candidates from (select id from lots
      where post_id=v_shipment.post_id and lot_no=v_shipment.lot_no order by id for update) x;
    if coalesce(cardinality(lot_candidates),0)<>1 then
      raise exception '出荷元ロットが未紐付けまたは複数あるため特定できません。管理者が確認してください';
    end if;
    select * into v_lot from lots where id=lot_candidates[1] for update;
  end if;

  if not found then
    raise exception '対象ロットが見つからないため、出荷取消できません';
  end if;

  if not app_private.same_lot_product(v_shipment.product_id,null,v_shipment.product_name,
    v_lot.product_id,v_lot.product_code,v_lot.product_name) then
    raise exception '出荷履歴と復元先ロットの製品が一致しません';
  end if;
  if exists(select 1 from inventory_allocations where post_id=v_shipment.post_id and lot_id is null
    and lot_no=v_shipment.lot_no and shipped_amount>0)
    and (select count(*) from lots where post_id=v_shipment.post_id and lot_no=v_shipment.lot_no)>1 then
    raise exception '旧引当履歴のロットが複数あるため特定できません。管理者が確認してください';
  end if;
  v_remaining := v_shipment.quantity;

  for v_allocation in
    select *
      from inventory_allocations
     where post_id = v_shipment.post_id
       and (
         lot_id = v_lot.id
         or (lot_id is null and lot_no = v_shipment.lot_no)
       )
       and shipped_amount > 0
     order by confirmed_at desc, lot_no desc
     for update
  loop
    exit when v_remaining <= 0;

    v_restore := least(v_remaining, v_allocation.shipped_amount);

    update inventory_allocations
       set shipped_amount = shipped_amount - v_restore
     where id = v_allocation.id;

    v_remaining := v_remaining - v_restore;
    v_allocated_restore_total := v_allocated_restore_total + v_restore;
  end loop;

  if v_allocated_restore_total > v_shipment.quantity then
    raise exception '引当復元数が出荷数を超えたため、出荷取消できません';
  end if;

  select *
    into v_inventory
    from inventory_items
   where lot_id = v_lot.id
   order by updated_at desc
   limit 1
   for update;

  if found then
    update inventory_items
       set current_stock = current_stock + v_shipment.quantity,
           allocated_stock = coalesce(allocated_stock, 0) + v_allocated_restore_total,
           updated_at = now()
     where id = v_inventory.id;
  else
    insert into inventory_items (
      product_id,
      lot_id,
      product_code,
      product_name,
      lot_no,
      current_stock,
      allocated_stock,
      updated_at
    ) values (
      coalesce(v_shipment.product_id, v_lot.product_id),
      v_lot.id,
      coalesce(v_lot.product_code, ''),
      coalesce(v_lot.product_name, v_shipment.product_name),
      coalesce(v_lot.lot_no, v_shipment.lot_no),
      v_shipment.quantity,
      v_allocated_restore_total,
      now()
    );
  end if;

  select max(scheduled_date)
    into v_last_shipped_at
    from shipments
   where lot_id = v_lot.id
     and id <> p_shipment_id
     and coalesce(cancelled, false) = false;

  update lots
     set inventory_amount = coalesce(inventory_amount, 0) + v_shipment.quantity,
         allocated_amount = coalesce(allocated_amount, 0) + v_allocated_restore_total,
         shipped_amount = greatest(coalesce(shipped_amount, 0) - v_shipment.quantity, 0),
         last_shipped_at = v_last_shipped_at,
         updated_at = now()
   where id = v_lot.id;

  update shipments
     set cancelled = true,
         cancelled_at = now(),
         cancelled_reason = nullif(trim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where id = p_shipment_id;
end;
$function$;

commit;
