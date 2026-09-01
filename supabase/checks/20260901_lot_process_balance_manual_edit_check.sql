select
  'edit_lot_process_balance_rpc' as check_name,
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'edit_lot_process_balance'
      and pg_get_function_identity_arguments(p.oid) =
        'p_balance_id uuid, p_after_quantity integer, p_reason text, p_idempotency_key text'
  ) then 'PASSED' else 'FAILED' end as result,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'edit_lot_process_balance'
      and pg_get_function_identity_arguments(p.oid) =
        'p_balance_id uuid, p_after_quantity integer, p_reason text, p_idempotency_key text'
  ) as actual_count,
  'edit_lot_process_balance(uuid, integer, text, text) exists.' as message
union all
select
  'manual_edit_history_type',
  case when exists (
    select 1
    from pg_constraint
    where conname = 'process_transfer_history_movement_type_chk'
      and pg_get_constraintdef(oid) like '%manual_edit%'
  ) then 'PASSED' else 'FAILED' end,
  case when exists (
    select 1
    from pg_constraint
    where conname = 'process_transfer_history_movement_type_chk'
      and pg_get_constraintdef(oid) like '%manual_edit%'
  ) then 1 else 0 end,
  'process_transfer_history accepts manual_edit movement records.'
union all
select
  'manual_edit_view_columns',
  case when count(*) = 2 then 'PASSED' else 'FAILED' end,
  count(*),
  'v_process_transfer_history_with_master exposes before/after quantities.'
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v_process_transfer_history_with_master'
  and column_name in ('before_from_quantity', 'after_from_quantity');
