-- Align the server-side result registration allowance with the production
-- results screen. Outsourced processes can receive results up to the greater
-- of previous completed amount, their current completed amount, and planned
-- amount, while normal processes remain limited by the previous process.

create or replace function register_order_process_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer
) returns void as $$
declare
  target_process order_processes%rowtype;
  previous_completed integer;
  allowance_completed integer;
  new_completed integer;
  is_outsourced boolean;
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

  if target_process.process_order = 1 then
    previous_completed := target_process.planned_amount;
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

  new_completed := target_process.completed_amount + p_amount;

  if new_completed > allowance_completed then
    raise exception 'Amount exceeds allowed quantity. Remaining allowance is %',
      greatest(allowance_completed - target_process.completed_amount, 0);
  end if;

  insert into production_results (
    schedule_id,
    post_id,
    order_process_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values (
    p_schedule_id,
    target_process.post_id,
    target_process.id,
    target_process.id::text,
    target_process.process_name,
    p_date,
    p_amount,
    now()
  );

  update order_processes
  set completed_amount = new_completed,
      completed_date = p_date,
      updated_at = now()
  where id = target_process.id;
end;
$$ language plpgsql;

grant execute on function register_order_process_result(uuid, uuid, date, integer) to anon, authenticated;