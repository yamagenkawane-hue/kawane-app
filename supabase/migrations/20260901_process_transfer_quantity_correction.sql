-- Allow progress-screen transfers to move a smaller quantity while clearing
-- the source process balance and recording the difference as a correction.

alter table process_transfer_history
  add column if not exists correction_quantity integer;

alter table process_transfer_history
  drop constraint if exists process_transfer_history_movement_type_chk;

alter table process_transfer_history
  add constraint process_transfer_history_movement_type_chk check (
    movement_type in (
      'manufacturing_result',
      'process_transfer',
      'manual_edit',
      'quantity_correction',
      'stock_in',
      'allocate',
      'ship',
      'restore',
      'delete'
    )
  );

drop view if exists v_process_transfer_history_with_master;

create view v_process_transfer_history_with_master as
select
  pth.id,
  pth.post_id,
  p.order_no,
  pth.lot_id,
  l.lot_no,
  l.material_lot_no,
  pth.from_order_process_id,
  pth.to_order_process_id,
  pth.from_process_name,
  pth.to_process_name,
  pth.from_process_order,
  pth.to_process_order,
  pth.quantity,
  pth.movement_type,
  pth.source_result_id,
  pth.before_from_quantity,
  pth.after_from_quantity,
  pth.before_to_quantity,
  pth.after_to_quantity,
  pth.correction_quantity,
  pth.reason,
  pth.created_by,
  pth.created_at,
  coalesce(pm.id, p.product_id, l.product_id) as product_id,
  coalesce(pm.product_code, p.product_code, l.product_code) as product_code,
  coalesce(pm.product_name, p.product_name, l.product_name) as product_name,
  coalesce(cm.id, p.customer_id, l.customer_id) as customer_id,
  coalesce(cm.customer_name, p.customer_name, l.customer_name) as customer_name
from process_transfer_history pth
join posts p on p.id = pth.post_id
join lots l on l.id = pth.lot_id
left join product_master pm on pm.id = coalesce(p.product_id, l.product_id)
left join customer_master cm on cm.id = coalesce(p.customer_id, l.customer_id);

grant select on v_process_transfer_history_with_master to anon, authenticated;

drop function if exists transfer_lot_to_next_process(uuid, uuid, integer, text, text);

create or replace function transfer_lot_to_next_process(
  p_lot_id uuid,
  p_from_order_process_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text
) returns table (
  from_balance_id uuid,
  to_balance_id uuid,
  movement_history_id uuid,
  stocked_inventory_item_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  trimmed_reason := nullif(trim(coalesce(p_reason, '')), '');

  if p_idempotency_key is not null then
    select
      pth.id
    into movement_history_id
    from process_transfer_history pth
    where pth.idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return next;
      return;
    end if;
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
    current_date,
    p_amount,
    now()
  )
  returning id into inserted_result_id;

  update order_processes
  set completed_amount = coalesce(completed_amount, 0) + p_amount,
      completed_date = current_date,
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
  return next;
end;
$$;

grant execute on function transfer_lot_to_next_process(uuid, uuid, integer, text, text)
  to anon, authenticated;
