-- Register finished goods into inventory only when a packaging process result
-- is recorded. Measurement results remain production_results only.

create or replace function register_order_process_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_process order_processes%rowtype;
  target_post posts%rowtype;
  target_inventory inventory_items%rowtype;
  previous_completed integer;
  allowance_completed integer;
  new_completed integer;
  is_outsourced boolean;
  is_packaging boolean;
  target_lot_no text;
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
      raise exception '受注データが見つかりません';
    end if;

    target_lot_no := nullif(trim(coalesce(target_post.lot_no, '')), '');

    if target_lot_no is null then
      raise exception '梱包完了後に在庫登録するにはロットNoが必要です';
    end if;
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

  if is_packaging then
    select *
    into target_inventory
    from inventory_items
    where lot_no = target_lot_no
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
          updated_at = now()
      where id = target_inventory.id;
    else
      insert into inventory_items (
        product_id,
        product_code,
        product_name,
        lot_no,
        current_stock,
        allocated_stock,
        updated_at
      ) values (
        target_process.product_id,
        target_process.product_code,
        target_process.product_name,
        target_lot_no,
        p_amount,
        0,
        now()
      );
    end if;
  end if;
end;
$$;

revoke all on function register_order_process_result(uuid, uuid, date, integer) from public;
grant execute on function register_order_process_result(uuid, uuid, date, integer) to anon, authenticated;
