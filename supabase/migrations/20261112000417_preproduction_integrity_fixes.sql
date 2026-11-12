-- Atomic calendar/department saves and strict transfer replay. No business backfill.
begin;
create table if not exists app_private.process_transfer_requests(
 request_key text primary key,input jsonb not null,response jsonb not null,actor_id uuid,created_at timestamptz not null default now()
);
alter table app_private.process_transfer_requests enable row level security;
revoke all on app_private.process_transfer_requests from public,anon,authenticated,service_role;
drop policy if exists deny_client_access on app_private.process_transfer_requests;
create policy deny_client_access on app_private.process_transfer_requests for all to public using(false) with check(false);

create or replace function public.replace_company_calendar_year(p_year integer,p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $body$
declare r jsonb; day date; start_date date; end_date date; inserted_count integer;
begin
 perform app_private.assert_access(true);
 if p_year is null or p_year<2000 or p_year>2100 then raise exception '対象年は2000〜2100年で指定してください'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'カレンダーを配列で指定してください'; end if;
 if jsonb_array_length(p_rows) not between 1 and 366 then raise exception '対象年のカレンダーを1〜366件で指定してください'; end if;
 start_date:=make_date(p_year,1,1); end_date:=make_date(p_year+1,1,1);
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'date') is distinct from 'string'
    or coalesce(r->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(r->'is_holiday') is distinct from 'boolean'
    or jsonb_typeof(r->'name') is distinct from 'string' or length(r->>'name')>200
    or jsonb_typeof(r->'type') is distinct from 'string' or length(r->>'type')>50 then
    raise exception 'カレンダーの入力形式が正しくありません';
  end if;
  day:=(r->>'date')::date;
  if day<start_date or day>=end_date then raise exception '対象年以外の日付が含まれています'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_rows) entry group by entry->>'date' having count(*)>1) then raise exception '日付が重複しています'; end if;
 lock table public.company_calendar in share row exclusive mode;
 delete from public.company_calendar where date>=start_date and date<end_date;
 insert into public.company_calendar(date,name,is_holiday,type)
   select (value->>'date')::date,value->>'name',(value->>'is_holiday')::boolean,value->>'type' from jsonb_array_elements(p_rows);
 get diagnostics inserted_count=row_count;
 return inserted_count;
end $body$;
revoke all on function public.replace_company_calendar_year(integer,jsonb) from public,anon;
grant execute on function public.replace_company_calendar_year(integer,jsonb) to authenticated,service_role;

create or replace function public.save_daily_department_dates(p_post_id uuid,p_manufacturing_date date,p_quality_date date,p_shipping_date date)
returns void language plpgsql security definer set search_path='' as $body$
declare p public.posts; s public.production_schedules; d text; finish date; i integer; remaining integer;
 departments text[]:=array['製造G','品質管理G','梱包出荷G']; dates date[]:=array[p_manufacturing_date,p_quality_date,p_shipping_date];
begin
 perform app_private.assert_access(false);
 select * into p from public.posts where id=p_post_id for update;
 if not found or p."delete" is true or p.shipment_closed_at is not null then raise exception '有効な注番が見つかりません'; end if;
 select greatest(coalesce(p.order_amount,0)-coalesce(sum(quantity),0),0)::integer into remaining
 from public.shipments where post_id=p.id and cancelled=false;
 for i in 1..3 loop
  d:=departments[i]; finish:=dates[i];
  select * into s from public.production_schedules where (post_id=p.id or (post_id is null and order_no=p.order_no))
    and coalesce(department,'製造G')=d order by created_at desc,id limit 1 for update;
  if found then
    update public.production_schedules set press_completed_date=finish,
      shipping_scheduled_end=coalesce(p.delivery_date,s.shipping_scheduled_end),updated_at=now() where id=s.id;
  elsif finish is not null then
    insert into public.production_schedules(post_id,order_no,customer_name,product_name,product_id,customer_id,
      press_number,lot_no,planned_start_date,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_end,department,updated_at)
    values(p.id,p.order_no,p.customer_name,p.product_name,p.product_id,p.customer_id,
      '',coalesce(p.lot_no,''),p.planned_start_date,remaining,0,finish,p.delivery_date,d,now());
  end if;
 end loop;
end $body$;
revoke all on function public.save_daily_department_dates(uuid,date,date,date) from public,anon;
grant execute on function public.save_daily_department_dates(uuid,date,date,date) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.transfer_lot_to_next_process(p_lot_id uuid, p_from_order_process_id uuid, p_amount integer, p_reason text, p_idempotency_key text, p_date date)
 RETURNS TABLE(from_balance_id uuid, to_balance_id uuid, movement_history_id uuid, stocked_inventory_item_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  from_process order_processes%rowtype;
  next_process order_processes%rowtype;
  target_lot lots%rowtype;
  source_balance lot_process_balance%rowtype;
  target_balance lot_process_balance%rowtype;
  target_inventory inventory_items%rowtype;
  inserted_result_id uuid;
  inserted_history_id uuid;
  before_from_quantity integer := 0;
  after_from_quantity integer := 0;
  before_to_quantity integer := 0;
  after_to_quantity integer := 0;
  correction_quantity integer := 0;
  trimmed_reason text;
  request_input jsonb;
  saved_request app_private.process_transfer_requests%rowtype;
  previous_history public.process_transfer_history%rowtype;
  previous_date date;
begin perform app_private.assert_access('f');
  if p_date is null or p_date > (now() at time zone 'Asia/Tokyo')::date then
    raise exception '実際の作業日を本日以前の日付で指定してください。';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  trimmed_reason := nullif(trim(coalesce(p_reason, '')), '');

  if nullif(btrim(p_idempotency_key),'') is null or length(p_idempotency_key)>200 then raise exception '有効な工程移動の処理キーを指定してください'; end if;
  request_input:=jsonb_build_object('lot_id',p_lot_id,'process_id',p_from_order_process_id,'amount',p_amount,'date',p_date,'reason',trimmed_reason);
  perform pg_advisory_xact_lock(hashtextextended('process-transfer:'||p_idempotency_key,0));
  select * into saved_request from app_private.process_transfer_requests where request_key=p_idempotency_key;
  if found then
    if saved_request.input is distinct from request_input then raise exception '同じ処理キーで異なる工程移動は登録できません'; end if;
    from_balance_id:=(saved_request.response->>'from_balance_id')::uuid;
    to_balance_id:=(saved_request.response->>'to_balance_id')::uuid;
    movement_history_id:=(saved_request.response->>'movement_history_id')::uuid;
    stocked_inventory_item_id:=(saved_request.response->>'stocked_inventory_item_id')::uuid;
    return next; return;
  end if;
  select * into previous_history from public.process_transfer_history where idempotency_key=p_idempotency_key;
  if found then
    select date into previous_date from public.production_results where id=previous_history.source_result_id;
    if previous_history.lot_id is distinct from p_lot_id or previous_history.from_order_process_id is distinct from p_from_order_process_id
      or previous_history.quantity is distinct from p_amount or previous_date is distinct from p_date
      or previous_history.reason is distinct from coalesce(trimmed_reason,'Progress screen transfer') then
      raise exception '同じ処理キーで異なる工程移動は登録できません';
    end if;
    movement_history_id:=previous_history.id;
    select id into from_balance_id from public.lot_process_balance where lot_id=p_lot_id and order_process_id=p_from_order_process_id;
    select id into to_balance_id from public.lot_process_balance where lot_id=p_lot_id and order_process_id=previous_history.to_order_process_id;
    if previous_history.to_order_process_id is null then select id into stocked_inventory_item_id from public.inventory_items where lot_id=p_lot_id order by id limit 1; end if;
    insert into app_private.process_transfer_requests(request_key,input,response,actor_id) values(p_idempotency_key,request_input,
      jsonb_build_object('from_balance_id',from_balance_id,'to_balance_id',to_balance_id,'movement_history_id',movement_history_id,'stocked_inventory_item_id',stocked_inventory_item_id),auth.uid());
    return next; return;
  end if;

  select *
  into from_process
  from order_processes
  where id = p_from_order_process_id
  for update;

  if not found then
    raise exception 'Source order process was not found';
  end if;

  if from_process.locked then
    raise exception 'Locked order process cannot be changed';
  end if;

  select *
  into target_lot
  from lots
  where id = p_lot_id
    and coalesce(deleted, false) = false
  for update;

  if not found then
    raise exception 'Lot was not found';
  end if;

  if target_lot.post_id is distinct from from_process.post_id then
    raise exception 'Selected lot does not belong to the source order';
  end if;

  select *
  into source_balance
  from lot_process_balance
  where lot_process_balance.lot_id = p_lot_id
    and lot_process_balance.order_process_id = p_from_order_process_id
  for update;

  if not found then
    raise exception 'Source lot balance was not found';
  end if;

  -- Full-balance transfer also consumes any quantity-correction loss.
  if exists (
    select 1 from public.production_results r join public.order_processes o on o.id=r.order_process_id
    where r.lot_id=p_lot_id and o.post_id=from_process.post_id and o.process_order<=from_process.process_order
      and r.amount>0 and (r.date is null or r.date>p_date)
  ) then raise exception '前工程の実績日より前、または実績日が未登録のため工程移動できません。'; end if;

  before_from_quantity := coalesce(source_balance.quantity, 0);

  if before_from_quantity < p_amount then
    raise exception 'Amount exceeds source lot balance. Remaining balance is %',
      before_from_quantity;
  end if;

  correction_quantity := before_from_quantity - p_amount;

  if correction_quantity > 0 and trimmed_reason is null then
    raise exception 'Correction reason is required when moving less than the source lot balance';
  end if;

  after_from_quantity := 0;

  update lot_process_balance
  set quantity = after_from_quantity,
      updated_at = now()
  where id = source_balance.id;

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
    null,
    from_process.post_id,
    from_process.id,
    p_lot_id,
    from_process.id::text,
    from_process.process_name,
    p_date,
    p_amount,
    now()
  )
  returning id into inserted_result_id;

  update order_processes
  set completed_amount = coalesce(completed_amount, 0) + p_amount,
      completed_date = (select max(date) from production_results where order_process_id = from_process.id),
      updated_at = now()
  where id = from_process.id;

  select *
  into next_process
  from order_processes
  where post_id = from_process.post_id
    and process_order > from_process.process_order
  order by process_order asc
  limit 1
  for update;

  if found then
    select *
    into target_balance
    from lot_process_balance
    where lot_process_balance.lot_id = p_lot_id
      and lot_process_balance.order_process_id = next_process.id
    for update;

    if found then
      before_to_quantity := coalesce(target_balance.quantity, 0);
      after_to_quantity := before_to_quantity + p_amount;

      update lot_process_balance
      set quantity = after_to_quantity,
          source_result_id = inserted_result_id,
          process_name = next_process.process_name,
          process_order = next_process.process_order,
          updated_at = now()
      where id = target_balance.id
      returning id into to_balance_id;
    else
      before_to_quantity := 0;
      after_to_quantity := p_amount;

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
        from_process.post_id,
        next_process.id,
        p_lot_id,
        next_process.process_name,
        next_process.process_order,
        p_amount,
        inserted_result_id,
        now(),
        now()
      )
      returning id into to_balance_id;
    end if;
  else
    select *
    into target_inventory
    from inventory_items
    where inventory_items.lot_id = p_lot_id
      and (
        (from_process.product_id is not null and inventory_items.product_id = from_process.product_id)
        or inventory_items.product_code = from_process.product_code
      )
    order by updated_at asc
    limit 1
    for update;

    if found then
      update inventory_items
      set current_stock = coalesce(current_stock, 0) + p_amount,
          updated_at = now()
      where id = target_inventory.id
      returning id into stocked_inventory_item_id;
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
        from_process.product_id,
        from_process.product_code,
        from_process.product_name,
        target_lot.lot_no,
        p_amount,
        0,
        now()
      )
      returning id into stocked_inventory_item_id;
    end if;

    update lots
    set inventory_amount = coalesce(inventory_amount, 0) + p_amount,
        status = 'stocked',
        updated_at = now()
    where id = p_lot_id;
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
    correction_quantity,
    reason,
    idempotency_key,
    created_at
  ) values (
    from_process.post_id,
    p_lot_id,
    from_process.id,
    next_process.id,
    from_process.process_name,
    next_process.process_name,
    from_process.process_order,
    next_process.process_order,
    p_amount,
    case
      when correction_quantity > 0 then 'quantity_correction'
      when next_process.id is null then 'stock_in'
      else 'process_transfer'
    end,
    inserted_result_id,
    before_from_quantity,
    after_from_quantity,
    before_to_quantity,
    after_to_quantity,
    correction_quantity,
    coalesce(trimmed_reason, 'Progress screen transfer'),
    p_idempotency_key,
    now()
  )
  returning id into inserted_history_id;

  from_balance_id := source_balance.id;
  movement_history_id := inserted_history_id;
  insert into app_private.process_transfer_requests(request_key,input,response,actor_id) values(p_idempotency_key,request_input,
    jsonb_build_object('from_balance_id',from_balance_id,'to_balance_id',to_balance_id,'movement_history_id',movement_history_id,'stocked_inventory_item_id',stocked_inventory_item_id),auth.uid());
  return next;
end;
$function$
;
notify pgrst,'reload schema';
commit;
