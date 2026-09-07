-- Allow shipment cancellation when part or all of the shipment was consumed
-- from unallocated inventory. Allocation shipment amounts are reversed only
-- for the portion that was actually recorded as allocated shipment.

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
      post_id,
      product_id,
      customer_id,
      lot_id,
      product_code,
      product_name,
      customer_name,
      lot_no,
      current_stock,
      allocated_stock,
      updated_at
    ) values (
      v_shipment.post_id,
      coalesce(v_shipment.product_id, v_lot.product_id),
      coalesce(v_shipment.customer_id, v_lot.customer_id),
      v_lot.id,
      coalesce(v_lot.product_code, ''),
      coalesce(v_lot.product_name, v_shipment.product_name),
      coalesce(v_lot.customer_name, v_shipment.customer_name),
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
