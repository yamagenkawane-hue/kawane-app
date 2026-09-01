-- Add an RPC for manual progress quantity edits.
-- Manual edits update the current lot/process balance and are logged in
-- process_transfer_history as movement_type = 'manual_edit'.

drop function if exists edit_lot_process_balance(uuid, integer, text, text);

create or replace function edit_lot_process_balance(
  p_balance_id uuid,
  p_after_quantity integer,
  p_reason text,
  p_idempotency_key text
) returns table (
  balance_id uuid,
  movement_history_id uuid,
  before_quantity integer,
  after_quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_balance lot_process_balance%rowtype;
  target_process order_processes%rowtype;
  target_lot lots%rowtype;
  inserted_history_id uuid;
  trimmed_reason text;
  movement_quantity integer;
begin
  if p_after_quantity < 0 then
    raise exception 'Quantity must be zero or greater';
  end if;

  trimmed_reason := nullif(trim(coalesce(p_reason, '')), '');

  if trimmed_reason is null then
    raise exception 'Edit reason is required';
  end if;

  if p_idempotency_key is not null then
    select
      pth.id,
      pth.before_from_quantity,
      pth.after_from_quantity
    into movement_history_id, before_quantity, after_quantity
    from process_transfer_history pth
    where pth.idempotency_key = p_idempotency_key
    limit 1;

    if found then
      balance_id := p_balance_id;
      return next;
      return;
    end if;
  end if;

  select *
  into target_balance
  from lot_process_balance lpb
  where lpb.id = p_balance_id
  for update;

  if not found then
    raise exception 'Lot process balance was not found';
  end if;

  select *
  into target_process
  from order_processes op
  where op.id = target_balance.order_process_id
  for update;

  if not found then
    raise exception 'Order process was not found';
  end if;

  if target_process.locked then
    raise exception 'Locked order process cannot be changed';
  end if;

  select *
  into target_lot
  from lots l
  where l.id = target_balance.lot_id
    and coalesce(l.deleted, false) = false
  for update;

  if not found then
    raise exception 'Lot was not found';
  end if;

  before_quantity := coalesce(target_balance.quantity, 0);
  after_quantity := p_after_quantity;

  if before_quantity = after_quantity then
    raise exception 'Quantity is unchanged';
  end if;

  movement_quantity := abs(after_quantity - before_quantity);

  update lot_process_balance
  set quantity = after_quantity,
      updated_at = now()
  where id = target_balance.id;

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
    created_by,
    created_at
  ) values (
    target_balance.post_id,
    target_balance.lot_id,
    target_balance.order_process_id,
    target_balance.order_process_id,
    target_balance.process_name,
    target_balance.process_name,
    target_balance.process_order,
    target_balance.process_order,
    movement_quantity,
    'manual_edit',
    target_balance.source_result_id,
    before_quantity,
    after_quantity,
    null,
    null,
    case when before_quantity > after_quantity then before_quantity - after_quantity else 0 end,
    trimmed_reason,
    p_idempotency_key,
    auth.uid(),
    now()
  )
  returning id into inserted_history_id;

  balance_id := target_balance.id;
  movement_history_id := inserted_history_id;
  return next;
end;
$$;

grant execute on function edit_lot_process_balance(uuid, integer, text, text)
  to anon, authenticated;
