-- Phase 2 for the revised progress model.
-- Adds RPCs for manufacturing lot creation and lot-based process transfers.

drop function if exists register_manufacturing_lot_result(
  uuid,
  uuid,
  date,
  integer,
  text,
  text,
  text
);

create or replace function register_manufacturing_lot_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer,
  p_lot_no text,
  p_material_lot_no text,
  p_idempotency_key text
) returns table (
  production_result_id uuid,
  lot_id uuid,
  moved_to_order_process_id uuid,
  movement_history_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  trimmed_lot_no := nullif(trim(coalesce(p_lot_no, '')), '');
  trimmed_material_lot_no := nullif(trim(coalesce(p_material_lot_no, '')), '');

  if trimmed_lot_no is null then
    raise exception 'Lot No is required';
  end if;

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

  select *
  into target_lot
  from lots
  where lot_no = trimmed_lot_no
    and coalesce(deleted, false) = false
  for update;

  if found and target_lot.post_id is distinct from target_process.post_id then
    raise exception 'Lot No already exists for another order';
  end if;

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
        material_lot_no = coalesce(trimmed_material_lot_no, material_lot_no),
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
      completed_date = p_date,
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
    )
    on conflict (lot_id, order_process_id) do update
    set quantity = lot_process_balance.quantity + excluded.quantity,
        source_result_id = excluded.source_result_id,
        process_name = excluded.process_name,
        process_order = excluded.process_order,
        updated_at = now();
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

  production_result_id := inserted_result_id;
  lot_id := target_lot.id;
  moved_to_order_process_id := next_process.id;
  movement_history_id := inserted_history_id;
  return next;
end;
$$;

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
begin
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

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

  after_from_quantity := before_from_quantity - p_amount;

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
    case when next_process.id is null then 'stock_in' else 'process_transfer' end,
    inserted_result_id,
    before_from_quantity,
    after_from_quantity,
    before_to_quantity,
    after_to_quantity,
    p_reason,
    p_idempotency_key,
    now()
  )
  returning id into inserted_history_id;

  from_balance_id := source_balance.id;
  movement_history_id := inserted_history_id;
  return next;
end;
$$;

grant execute on function register_manufacturing_lot_result(uuid, uuid, date, integer, text, text, text)
  to anon, authenticated;
grant execute on function transfer_lot_to_next_process(uuid, uuid, integer, text, text)
  to anon, authenticated;
