begin;

-- A shipment owns the exact inventory/allocation movements used by its reversal.
alter table public.shipments add column if not exists idempotency_key text;
alter table public.shipments add column if not exists inventory_movements jsonb;
create unique index if not exists shipments_idempotency_key_idx on public.shipments(idempotency_key);

create or replace function public.guard_order_cancellation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new."delete" is true and old."delete" is distinct from true then
    if exists (select 1 from shipments where post_id=old.id or (post_id is null and order_no=old.order_no))
      or exists (select 1 from production_results r where r.post_id=old.id
        or r.order_process_id in (select id from order_processes where post_id=old.id)
        or r.schedule_id in (select id from production_schedules where post_id=old.id or (post_id is null and order_no=old.order_no)))
      or exists (select 1 from lots where post_id=old.id)
      or exists (select 1 from inventory_allocations where post_id=old.id)
      or exists (select 1 from process_transfer_history where post_id=old.id)
      or exists (select 1 from lot_process_balance where post_id=old.id)
      or exists (select 1 from order_processes where post_id=old.id and
        (coalesce(completed_amount,0)>0 or completed_date is not null or outsource_sent_date is not null or outsource_returned_date is not null))
    then
      raise exception '実績・ロット・引当・出荷履歴のある注番は削除できません。削除は未着手の誤登録・重複登録の取消専用です。';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_order_cancellation on public.posts;
create trigger trg_guard_order_cancellation before update of "delete" on public.posts
for each row execute function public.guard_order_cancellation();

create or replace function public.soft_delete_order_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from posts where id=p_post_id for update;
  if not found then raise exception '受注データが見つかりません'; end if;
  -- Never remove related history or change inventory when cancelling a mistaken entry.
  update posts set "delete"=true, updated_at=now() where id=p_post_id;
end $$;
revoke delete on public.posts from public,anon,authenticated;

-- A concurrent production registration must not attach itself to a cancelled order.
create or replace function public.require_active_order() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.post_id is not null then
    perform 1 from posts where id=new.post_id and "delete" is not true for update;
    if not found then raise exception '取消済みの注番には登録できません'; end if;
  end if;
  return new;
end $$;
do $$ declare v_table text; begin
  foreach v_table in array array['lots','production_results','inventory_allocations','shipments','production_schedules','order_processes'] loop
    execute format('drop trigger if exists trg_require_active_order on public.%I',v_table);
    execute format('create trigger trg_require_active_order before insert or update of post_id on public.%I for each row execute function public.require_active_order()',v_table);
  end loop;
end $$;

create or replace function public.confirm_inventory_allocation(p_post_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_post posts%rowtype;
  v_lot lots%rowtype;
  v_inventory inventory_items%rowtype;
  v_remaining integer;
  v_take integer;
  v_total integer := 0;
begin
  select * into v_post from posts where id=p_post_id for update;
  if not found or v_post."delete" is true then raise exception '有効な注番が見つかりません'; end if;
  if exists(select 1 from inventory_allocations where post_id=p_post_id) then
    raise exception 'この注番はすでに在庫引当が確定済みです';
  end if;
  select greatest(coalesce(v_post.order_amount,0)-coalesce(sum(quantity),0),0) into v_remaining
    from shipments where (post_id=p_post_id or (post_id is null and order_no=v_post.order_no)) and cancelled is not true;
  if v_remaining=0 then raise exception '注残がないため在庫引当できません'; end if;
  for v_lot in select * from lots where deleted is not true and
    (product_id=v_post.product_id or (product_id is null or v_post.product_id is null)
      and nullif(v_post.product_code,'') is not null and product_code=v_post.product_code)
    order by id for update loop
    exit when v_remaining=0;
    for v_inventory in select * from inventory_items where lot_id=v_lot.id order by id for update loop
      exit when v_remaining=0;
      v_take:=least(v_remaining,greatest(current_stock-coalesce(allocated_stock,0),0))
        from inventory_items where id=v_inventory.id;
      if v_take>0 then
        insert into inventory_allocations(post_id,inventory_item_id,product_id,product_code,lot_id,lot_no,allocated_amount)
          values(p_post_id,v_inventory.id,v_post.product_id,v_post.product_code,v_lot.id,v_lot.lot_no,v_take);
        update inventory_items set allocated_stock=coalesce(allocated_stock,0)+v_take,updated_at=now() where id=v_inventory.id;
        v_total:=v_total+v_take;
        v_remaining:=v_remaining-v_take;
      end if;
    end loop;
    update lots set allocated_amount=(select coalesce(sum(allocated_stock),0) from inventory_items where lot_id=v_lot.id),updated_at=now() where id=v_lot.id;
  end loop;
  if v_total=0 then raise exception 'ロットに紐づいた引当可能な在庫がありません'; end if;
end $$;
revoke all on function public.confirm_inventory_allocation(uuid) from public;
grant execute on function public.confirm_inventory_allocation(uuid) to anon,authenticated;

create or replace function public.register_shipment(
  p_post_id uuid, p_lot_id uuid, p_quantity integer,
  p_scheduled_date date, p_idempotency_key text
) returns shipments
language plpgsql security definer set search_path = public as $$
declare
  v_post posts%rowtype;
  v_lot lots%rowtype;
  v_shipment shipments%rowtype;
  v_inventory inventory_items%rowtype;
  v_allocation inventory_allocations%rowtype;
  v_remaining integer := p_quantity;
  v_take integer;
  v_allocated integer;
  v_part integer;
  v_shipped bigint;
  v_allocations jsonb;
  v_movements jsonb := '[]'::jsonb;
begin
  if p_quantity is null or p_quantity<=0 or p_scheduled_date is null
    or nullif(trim(p_idempotency_key),'') is null then
    raise exception '出荷数量・出荷予定日・処理キーを確認してください';
  end if;
  -- Serialise duplicate requests, even when they contain different order IDs.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  select * into v_shipment from shipments where idempotency_key=p_idempotency_key;
  if found then
    if v_shipment.post_id is distinct from p_post_id or v_shipment.lot_id is distinct from p_lot_id
      or v_shipment.quantity<>p_quantity or v_shipment.scheduled_date<>p_scheduled_date then
      raise exception '同じ処理キーで異なる出荷は登録できません';
    end if;
    return v_shipment;
  end if;
  select * into v_post from posts where id=p_post_id for update;
  if not found or v_post."delete" is true then raise exception '有効な注番が見つかりません'; end if;
  select coalesce(sum(quantity),0) into v_shipped from shipments
    where (post_id=p_post_id or (post_id is null and order_no=v_post.order_no)) and cancelled is not true;
  if p_quantity > coalesce(v_post.order_amount,0)-v_shipped then raise exception '出荷数が注残数を超えています'; end if;
  select * into v_lot from lots where id=p_lot_id for update;
  if not found or v_lot.deleted is true then raise exception '有効なロットが見つかりません'; end if;
  if not coalesce((coalesce(v_post.product_id=v_lot.product_id,false)
    or (v_post.product_id is null or v_lot.product_id is null) and
      nullif(v_post.product_code,'') is not null and v_post.product_code=v_lot.product_code),false) then
    raise exception '注番とロットの製品が一致しません';
  end if;
  for v_inventory in select * from inventory_items where lot_id=p_lot_id order by id for update loop
    exit when v_remaining=0;
    v_allocated:=0;
    v_allocations:='[]'::jsonb;
    for v_allocation in select * from inventory_allocations
      where post_id=p_post_id and inventory_item_id=v_inventory.id and allocated_amount>shipped_amount
      order by id for update loop
      v_part:=least(v_remaining-v_allocated,v_allocation.allocated_amount-v_allocation.shipped_amount);
      exit when v_part=0;
      v_allocations:=v_allocations || jsonb_build_array(jsonb_build_object('id',v_allocation.id,'quantity',v_part));
      update inventory_allocations set shipped_amount=shipped_amount+v_part where id=v_allocation.id;
      v_allocated:=v_allocated+v_part;
    end loop;
    if v_allocated>coalesce(v_inventory.allocated_stock,0) or v_inventory.current_stock<coalesce(v_inventory.allocated_stock,0) then
      raise exception '在庫と引当数量が一致していません。管理者に確認してください';
    end if;
    v_take:=least(v_remaining,greatest(v_inventory.current_stock-coalesce(v_inventory.allocated_stock,0),0)+v_allocated);
    if v_take>0 then
      update inventory_items set current_stock=current_stock-v_take,
        allocated_stock=coalesce(allocated_stock,0)-v_allocated,updated_at=now() where id=v_inventory.id;
      v_movements:=v_movements || jsonb_build_array(jsonb_build_object(
        'inventory_id',v_inventory.id,'quantity',v_take,'allocated',v_allocated,'allocations',v_allocations));
      v_remaining:=v_remaining-v_take;
    end if;
  end loop;
  if v_remaining>0 then raise exception '選択したロットの出荷可能在庫が不足しています'; end if;
  insert into shipments(post_id,order_no,customer_name,product_name,product_id,customer_id,lot_id,lot_no,
    scheduled_date,delivery_date,order_amount,quantity,idempotency_key,inventory_movements)
  values(p_post_id,v_post.order_no,coalesce(v_post.customer_name,''),coalesce(v_post.product_name,''),
    v_post.product_id,v_post.customer_id,p_lot_id,v_lot.lot_no,p_scheduled_date,v_post.delivery_date,
    v_post.order_amount,p_quantity,p_idempotency_key,v_movements) returning * into v_shipment;
  update lots set inventory_amount=(select coalesce(sum(current_stock),0) from inventory_items where lot_id=p_lot_id),
    allocated_amount=(select coalesce(sum(allocated_stock),0) from inventory_items where lot_id=p_lot_id),
    shipped_amount=coalesce(shipped_amount,0)+p_quantity,
    last_shipped_at=greatest(last_shipped_at,p_scheduled_date),updated_at=now() where id=p_lot_id;
  return v_shipment;
end $$;
revoke all on function public.register_shipment(uuid,uuid,integer,date,text) from public,anon,authenticated;
grant execute on function public.register_shipment(uuid,uuid,integer,date,text) to service_role;
do $$ begin
  if to_regprocedure('public.ship_inventory_for_post(uuid,integer)') is not null then
    revoke all on function public.ship_inventory_for_post(uuid,integer) from public,anon,authenticated;
  end if;
end $$;

create or replace function public.protect_shipped_inventory() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from shipments where cancelled is not true and
    inventory_movements @> jsonb_build_array(jsonb_build_object('inventory_id',old.id))) then
    raise exception '出荷取消に必要な在庫レコードは削除できません。出荷履歴を先に確認してください';
  end if;
  return old;
end $$;
drop trigger if exists trg_protect_shipped_inventory on public.inventory_items;
create trigger trg_protect_shipped_inventory before delete on public.inventory_items
for each row execute function public.protect_shipped_inventory();

-- Keep the existing restoration path for shipments made before this migration.
do $$ begin
  if to_regprocedure('public.cancel_shipment_legacy(uuid,text)') is null then
    alter function public.cancel_shipment_and_restore_inventory(uuid,text) rename to cancel_shipment_legacy;
  end if;
end $$;
revoke all on function public.cancel_shipment_legacy(uuid,text) from public,anon,authenticated;

create or replace function public.cancel_shipment_and_restore_inventory(p_shipment_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_shipment shipments%rowtype;
  v_movement jsonb;
  v_allocation jsonb;
begin
  select * into v_shipment from shipments where id=p_shipment_id;
  if not found then raise exception '出荷履歴が見つかりません'; end if;
  perform 1 from posts where id=v_shipment.post_id for update;
  select * into v_shipment from shipments where id=p_shipment_id for update;
  if v_shipment.cancelled is true then return; end if;
  if v_shipment.inventory_movements is null then
    perform cancel_shipment_legacy(p_shipment_id,p_reason);
    return;
  end if;
  perform 1 from lots where id=v_shipment.lot_id for update;
  for v_movement in select value from jsonb_array_elements(v_shipment.inventory_movements) loop
    update inventory_items set current_stock=current_stock+(v_movement->>'quantity')::integer,
      allocated_stock=coalesce(allocated_stock,0)+(v_movement->>'allocated')::integer,updated_at=now()
      where id=(v_movement->>'inventory_id')::uuid;
    if not found then raise exception '元の在庫レコードがないため取消できません'; end if;
    for v_allocation in select value from jsonb_array_elements(v_movement->'allocations') loop
      update inventory_allocations set shipped_amount=shipped_amount-(v_allocation->>'quantity')::integer
        where id=(v_allocation->>'id')::uuid and shipped_amount>=(v_allocation->>'quantity')::integer;
      if not found then raise exception '元の引当レコードを復元できません'; end if;
    end loop;
  end loop;
  update shipments set cancelled=true,cancelled_at=now(),cancelled_reason=nullif(trim(p_reason),''),updated_at=now()
    where id=p_shipment_id;
  update lots set inventory_amount=(select coalesce(sum(current_stock),0) from inventory_items where lot_id=v_shipment.lot_id),
    allocated_amount=(select coalesce(sum(allocated_stock),0) from inventory_items where lot_id=v_shipment.lot_id),
    shipped_amount=greatest(coalesce(shipped_amount,0)-v_shipment.quantity,0),
    last_shipped_at=(select max(scheduled_date) from shipments where lot_id=v_shipment.lot_id and cancelled is not true),
    updated_at=now() where id=v_shipment.lot_id;
end $$;
revoke all on function public.cancel_shipment_and_restore_inventory(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_shipment_and_restore_inventory(uuid,text) to service_role;

-- Shipping is based on live stock, including stock allocated from another order.
create or replace view public.v_shipping_candidates as
select p.id as post_id,p.order_no,p.product_code,p.product_name,p.customer_name,
  p.order_amount,p.delivery_date,p.completion_scheduled_date,l.id as lot_id,l.lot_no,
  sum(i.current_stock)::bigint as current_stock,
  least(greatest(p.order_amount-coalesce(s.quantity,0),0),
    sum(greatest(i.current_stock-coalesce(i.allocated_stock,0),0)+coalesce(a.quantity,0)))::bigint as available_quantity
from v_posts_with_master p
join lots l on (p.product_id=l.product_id or (p.product_id is null or l.product_id is null)
  and nullif(p.product_code,'') is not null and p.product_code=l.product_code) and l.deleted is not true
join inventory_items i on i.lot_id=l.id
left join lateral (select sum(quantity) as quantity from shipments
  where (post_id=p.id or (post_id is null and order_no=p.order_no)) and cancelled is not true) s on true
left join lateral (select sum(greatest(allocated_amount-shipped_amount,0)) as quantity from inventory_allocations
  where post_id=p.id and inventory_item_id=i.id) a on true
where p."delete" is not true
group by p.id,p.order_no,p.product_code,p.product_name,p.customer_name,p.order_amount,p.delivery_date,
  p.completion_scheduled_date,l.id,l.lot_no,s.quantity;
grant select on public.v_shipping_candidates to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
