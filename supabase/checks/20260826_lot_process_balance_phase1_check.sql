with checks as (
  select
    'lot_process_balance_table' as check_name,
    case when to_regclass('public.lot_process_balance') is not null then 'PASSED' else 'FAILED' end as result,
    case when to_regclass('public.lot_process_balance') is not null then 1 else 0 end as actual_count,
    'lot_process_balance table exists.' as message
  union all
  select
    'lot_process_balance_columns',
    case when count(*) = 11 then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'lot_process_balance has the required phase 1 columns.'
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'lot_process_balance'
    and column_name in (
      'id',
      'post_id',
      'order_process_id',
      'lot_id',
      'process_name',
      'process_order',
      'quantity',
      'source_result_id',
      'version',
      'created_at',
      'updated_at'
    )
  union all
  select
    'process_transfer_history_table',
    case when to_regclass('public.process_transfer_history') is not null then 'PASSED' else 'FAILED' end,
    case when to_regclass('public.process_transfer_history') is not null then 1 else 0 end,
    'process_transfer_history table exists.'
  union all
  select
    'process_transfer_history_columns',
    case when count(*) = 21 then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'process_transfer_history has the required phase 1 columns.'
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'process_transfer_history'
    and column_name in (
      'id',
      'post_id',
      'lot_id',
      'from_order_process_id',
      'to_order_process_id',
      'from_process_name',
      'to_process_name',
      'from_process_order',
      'to_process_order',
      'quantity',
      'movement_type',
      'source_result_id',
      'before_from_quantity',
      'after_from_quantity',
      'before_to_quantity',
      'after_to_quantity',
      'correction_quantity',
      'reason',
      'idempotency_key',
      'created_by',
      'created_at'
    )
  union all
  select
    'lot_process_balance_unique_index',
    case when to_regclass('public.lot_process_balance_lot_process_unique_idx') is not null then 'PASSED' else 'FAILED' end,
    case when to_regclass('public.lot_process_balance_lot_process_unique_idx') is not null then 1 else 0 end,
    'Unique index on lot_id and order_process_id exists.'
  union all
  select
    'process_transfer_history_idempotency_index',
    case when to_regclass('public.process_transfer_history_idempotency_unique_idx') is not null then 'PASSED' else 'FAILED' end,
    case when to_regclass('public.process_transfer_history_idempotency_unique_idx') is not null then 1 else 0 end,
    'Partial unique index for idempotency_key exists.'
  union all
  select
    'lot_process_balance_view',
    case when to_regclass('public.v_lot_process_balance_with_master') is not null then 'PASSED' else 'FAILED' end,
    case when to_regclass('public.v_lot_process_balance_with_master') is not null then 1 else 0 end,
    'v_lot_process_balance_with_master exists.'
  union all
  select
    'process_transfer_history_view',
    case when to_regclass('public.v_process_transfer_history_with_master') is not null then 'PASSED' else 'FAILED' end,
    case when to_regclass('public.v_process_transfer_history_with_master') is not null then 1 else 0 end,
    'v_process_transfer_history_with_master exists.'
)
select *
from checks
order by check_name;
