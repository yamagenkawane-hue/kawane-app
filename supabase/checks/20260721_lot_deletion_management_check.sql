with column_check as (
  select count(*)::integer as actual_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'lots'
    and column_name in ('deleted', 'deleted_at', 'deleted_reason')
),
view_check as (
  select count(*)::integer as actual_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_lot_flow_status'
    and column_name in ('deleted', 'deleted_at', 'deleted_reason')
),
function_check as (
  select count(*)::integer as actual_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'soft_delete_lot',
      'restore_deleted_lot',
      'permanently_delete_lot'
    )
)
select
  'lot_delete_columns' as check_name,
  case when actual_count = 3 then 'PASSED' else 'FAILED' end as result,
  actual_count,
  'lots has deleted, deleted_at, and deleted_reason columns.' as message
from column_check
union all
select
  'lot_flow_delete_columns' as check_name,
  case when actual_count = 3 then 'PASSED' else 'FAILED' end as result,
  actual_count,
  'v_lot_flow_status exposes deleted lot fields for normal/deleted lot screens.' as message
from view_check
union all
select
  'lot_delete_rpcs' as check_name,
  case when actual_count >= 3 then 'PASSED' else 'FAILED' end as result,
  actual_count,
  'soft_delete_lot, restore_deleted_lot, and permanently_delete_lot exist for UI-driven deletion.' as message
from function_check;
