-- Add soft-delete management for lot tracking and provide an operator-safe
-- permanent delete RPC for deleted lots.

alter table lots
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text;

create index if not exists lots_deleted_idx on lots (deleted, deleted_at);

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
  group by lot_id
) s on s.lot_id = l.id;

create or replace function permanently_delete_lot(p_lot_id uuid)
returns void as $$
declare
  target_lot lots%rowtype;
begin
  select *
    into target_lot
    from lots
   where id = p_lot_id
   for update;

  if not found then
    raise exception 'ロットが見つかりません';
  end if;

  if coalesce(target_lot.deleted, false) is not true then
    raise exception '完全削除する前に、ロットを削除済みにしてください';
  end if;

  delete from shipments
   where lot_id = p_lot_id;

  delete from inventory_allocations
   where lot_id = p_lot_id;

  delete from inventory_items
   where lot_id = p_lot_id;

  delete from production_results
   where lot_id = p_lot_id;

  delete from lots
   where id = p_lot_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function permanently_delete_lot(uuid) to anon, authenticated;
