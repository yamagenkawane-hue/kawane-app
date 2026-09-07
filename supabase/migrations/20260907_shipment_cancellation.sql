-- Add shipment cancellation support.
-- Cancelled shipments remain as history, but active shipment totals and lot
-- shipment summaries ignore them.

alter table shipments
  add column if not exists cancelled boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text;

create index if not exists shipments_cancelled_idx
  on shipments (cancelled, cancelled_at);

create or replace view v_shipments_with_master as
select
  s.id,
  s.post_id,
  coalesce(p.order_no, s.order_no) as order_no,
  s.product_id,
  coalesce(pm.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, s.product_name, p.product_name) as product_name,
  s.customer_id,
  coalesce(cm.customer_name, s.customer_name, p.customer_name) as customer_name,
  s.lot_no,
  s.scheduled_date,
  s.delivery_date,
  s.order_amount,
  s.quantity,
  s.created_at,
  s.updated_at,
  s.lot_id,
  coalesce(s.cancelled, false) as cancelled,
  s.cancelled_at,
  s.cancelled_reason
from shipments s
left join posts p
  on p.id = s.post_id
left join product_master pm
  on pm.id = s.product_id
left join customer_master cm
  on cm.id = s.customer_id;

create or replace function cancel_shipment_and_restore_inventory(
  p_shipment_id uuid,
  p_reason text
) returns void as $$
declare
  v_shipment record;
  v_lot record;
  v_inventory record;
  v_allocation record;
  v_remaining integer := 0;
  v_restore integer := 0;
  v_allocated_restore_total integer := 0;
  v_last_shipped_at date;
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
    select *
      into v_lot
      from lots
     where post_id = v_shipment.post_id
       and lot_no = v_shipment.lot_no
     order by created_at desc
     limit 1
     for update;
  end if;

  if not found then
    raise exception '対象ロットが見つからないため、出荷取消できません';
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

  if v_allocated_restore_total <> v_shipment.quantity then
    raise exception '出荷数と引当出荷数が一致しないため、出荷取消できません';
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
$$ language plpgsql security definer set search_path = public;

revoke all on function cancel_shipment_and_restore_inventory(uuid, text) from public;
grant execute on function cancel_shipment_and_restore_inventory(uuid, text) to service_role;

create or replace view v_lot_flow_status as
select
  l.id,
  l.post_id,
  coalesce(p.order_no, l.order_no) as order_no,
  l.product_id,
  coalesce(pm.product_code, l.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, l.product_name, p.product_name) as product_name,
  l.customer_id,
  coalesce(cm.customer_name, l.customer_name, p.customer_name) as customer_name,
  l.lot_no,
  l.material_lot_no,
  l.measurement_result_id,
  l.measurement_order_process_id,
  coalesce(l.measured_amount, 0) as measured_amount,
  coalesce(l.packaged_amount, 0) as packaged_amount,
  coalesce(ii.current_stock_sum, l.inventory_amount, 0) as inventory_amount,
  coalesce(ia.allocated_sum, l.allocated_amount, 0) as allocated_amount,
  coalesce(s.shipped_sum, l.shipped_amount, 0) as shipped_amount,
  greatest(coalesce(l.measured_amount, 0) - coalesce(s.shipped_sum, l.shipped_amount, 0), 0) as remaining_amount,
  case
    when coalesce(l.status, '') = 'cancelled' then 'cancelled'
    when coalesce(s.shipped_sum, l.shipped_amount, 0) >= coalesce(l.measured_amount, 0)
      and coalesce(l.measured_amount, 0) > 0 then 'shipped'
    when coalesce(s.shipped_sum, l.shipped_amount, 0) > 0 then 'partial_shipped'
    when coalesce(ia.allocated_sum, l.allocated_amount, 0) > 0 then 'allocated'
    when coalesce(ii.current_stock_sum, l.inventory_amount, 0) > 0 then 'stocked'
    when coalesce(l.packaged_amount, 0) > 0 then 'packaging'
    else 'measured'
  end as flow_status,
  l.measured_at,
  l.packaged_at,
  l.last_shipped_at,
  l.note,
  l.created_at,
  l.updated_at,
  coalesce(l.deleted, false) as deleted,
  l.deleted_at,
  l.deleted_reason
from lots l
left join posts p on p.id = l.post_id
left join product_master pm on pm.id = coalesce(l.product_id, p.product_id)
left join customer_master cm on cm.id = coalesce(l.customer_id, p.customer_id)
left join (
  select lot_id, sum(current_stock)::integer as current_stock_sum
  from inventory_items
  where lot_id is not null
  group by lot_id
) ii on ii.lot_id = l.id
left join (
  select lot_id, sum(allocated_amount - shipped_amount)::integer as allocated_sum
  from inventory_allocations
  where lot_id is not null
  group by lot_id
) ia on ia.lot_id = l.id
left join (
  select lot_id, sum(quantity)::integer as shipped_sum
  from shipments
  where lot_id is not null
    and coalesce(cancelled, false) = false
  group by lot_id
) s on s.lot_id = l.id;
