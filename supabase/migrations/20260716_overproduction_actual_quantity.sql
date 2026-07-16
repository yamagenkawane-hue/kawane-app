-- Allow explicit overproduction at the first process while keeping downstream
-- processes capped by the actual completed amount of the previous process.

alter table if exists order_processes
  drop constraint if exists order_processes_completed_not_over_planned_chk;

alter table if exists production_schedules
  drop constraint if exists production_schedules_completed_not_over_plan_chk;

create or replace function register_order_process_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer,
  p_lot_id uuid,
  p_allow_overproduction boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
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
begin
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
$$;

revoke all on function register_order_process_result(uuid, uuid, date, integer, uuid, boolean) from public;
grant execute on function register_order_process_result(uuid, uuid, date, integer, uuid, boolean) to anon, authenticated;

create or replace function register_order_process_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer,
  p_lot_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  select public.register_order_process_result($1, $2, $3, $4, $5, false);
$$;

revoke all on function register_order_process_result(uuid, uuid, date, integer, uuid) from public;
grant execute on function register_order_process_result(uuid, uuid, date, integer, uuid) to anon, authenticated;

create or replace function register_order_process_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer
) returns void
language sql
security definer
set search_path = public
as $$
  select public.register_order_process_result($1, $2, $3, $4, null::uuid, false);
$$;

revoke all on function register_order_process_result(uuid, uuid, date, integer) from public;
grant execute on function register_order_process_result(uuid, uuid, date, integer) to anon, authenticated;
