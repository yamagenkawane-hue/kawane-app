with checks as (
  select
    'register_manufacturing_lot_result_rpc' as check_name,
    case when count(*) = 1 then 'PASSED' else 'FAILED' end as result,
    count(*)::integer as actual_count,
    'register_manufacturing_lot_result(uuid, uuid, date, integer, text, text, text) exists.' as message
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'register_manufacturing_lot_result'
    and pg_get_function_arguments(p.oid) =
      'p_order_process_id uuid, p_schedule_id uuid, p_date date, p_amount integer, p_lot_no text, p_material_lot_no text, p_idempotency_key text'
  union all
  select
    'transfer_lot_to_next_process_rpc',
    case when count(*) = 1 then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'transfer_lot_to_next_process(uuid, uuid, integer, text, text) exists.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'transfer_lot_to_next_process'
    and pg_get_function_arguments(p.oid) =
      'p_lot_id uuid, p_from_order_process_id uuid, p_amount integer, p_reason text, p_idempotency_key text'
  union all
  select
    'transfer_history_movement_types',
    case when count(*) = 1 then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'process_transfer_history movement type constraint exists.'
  from pg_constraint
  where conname = 'process_transfer_history_movement_type_chk'
  union all
  select
    'phase1_tables_available',
    case
      when to_regclass('public.lot_process_balance') is not null
        and to_regclass('public.process_transfer_history') is not null
      then 'PASSED'
      else 'FAILED'
    end,
    (
      case when to_regclass('public.lot_process_balance') is not null then 1 else 0 end
      + case when to_regclass('public.process_transfer_history') is not null then 1 else 0 end
    )::integer,
    'Phase 1 tables are available before using process transfer RPCs.'
)
select *
from checks
order by check_name;
