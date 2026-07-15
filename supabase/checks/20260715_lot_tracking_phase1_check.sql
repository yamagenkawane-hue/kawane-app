-- Checks for lot tracking Phase 1.
-- Run after supabase/migrations/20260715_lot_tracking_phase1.sql.

select
  'lot_columns' as check_name,
  case when count(*) = 15 then 'PASSED' else 'FAILED' end as result,
  count(*) as actual_count,
  'lots has post_id, material lot, quantities, and tracking date columns.' as message
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lots'
  and column_name in (
    'post_id',
    'order_no',
    'product_code',
    'material_lot_no',
    'measurement_result_id',
    'measurement_order_process_id',
    'measured_amount',
    'packaged_amount',
    'inventory_amount',
    'allocated_amount',
    'shipped_amount',
    'measured_at',
    'packaged_at',
    'last_shipped_at',
    'note'
  )
union all
select
  'lot_id_columns' as check_name,
  case when count(*) = 4 then 'PASSED' else 'FAILED' end as result,
  count(*) as actual_count,
  'production_results, inventory_items, inventory_allocations, and shipments have lot_id.' as message
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'production_results' and column_name = 'lot_id')
    or (table_name = 'inventory_items' and column_name = 'lot_id')
    or (table_name = 'inventory_allocations' and column_name = 'lot_id')
    or (table_name = 'shipments' and column_name = 'lot_id')
  )
union all
select
  'lot_flow_view' as check_name,
  case when count(*) = 1 then 'PASSED' else 'FAILED' end as result,
  count(*) as actual_count,
  'v_lot_flow_status exists.' as message
from information_schema.views
where table_schema = 'public'
  and table_name = 'v_lot_flow_status'
union all
select
  'posts_with_lot_have_lot_rows' as check_name,
  case when count(*) = 0 then 'PASSED' else 'FAILED' end as result,
  count(*) as actual_count,
  'Active posts with lot_no should have corresponding lots rows.' as message
from posts p
where coalesce(p.delete, false) = false
  and nullif(trim(coalesce(p.lot_no, '')), '') is not null
  and not exists (
    select 1
    from lots l
    where l.post_id = p.id
      and nullif(trim(coalesce(l.lot_no, '')), '') = nullif(trim(coalesce(p.lot_no, '')), '')
  )
union all
select
  'lot_flow_query' as check_name,
  'INFO' as result,
  count(*) as actual_count,
  'Current lot flow rows.' as message
from v_lot_flow_status;
