-- Cross-screen scenario E check: delete order cleanup.
--
-- Replace target_order_no with the order number deleted from the UI, then run
-- this after deleting the order from the order-balance screen.
--
-- Expected result:
-- - All rows have result = PASSED.

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_posts as (
  select p.*
  from posts p
  join params on params.target_order_no = p.order_no
), target_order_processes as (
  select op.*
  from order_processes op
  join params on params.target_order_no = op.order_no
  union
  select op.*
  from order_processes op
  join target_posts tp on tp.id = op.post_id
), post_summary as (
  select
    count(*)::integer as post_count,
    count(*) filter (where coalesce("delete", false) = true)::integer as deleted_post_count,
    count(*) filter (where coalesce("delete", false) = false)::integer as active_post_count
  from target_posts
), order_process_summary as (
  select count(*)::integer as remaining_count
  from target_order_processes
), production_result_summary as (
  select count(*)::integer as remaining_count
  from production_results pr
  where pr.post_id in (select id from target_posts)
     or pr.order_process_id in (select id from target_order_processes)
), production_schedule_summary as (
  select count(*)::integer as remaining_count
  from production_schedules ps
  join params on true
  where ps.post_id in (select id from target_posts)
     or nullif(trim(coalesce(ps.order_no, '')), '') = params.target_order_no
), shipment_summary as (
  select count(*)::integer as remaining_count
  from shipments s
  join params on true
  where s.post_id in (select id from target_posts)
     or nullif(trim(coalesce(s.order_no, '')), '') = params.target_order_no
), allocation_summary as (
  select
    count(*)::integer as remaining_count,
    coalesce(sum(greatest(allocated_amount - shipped_amount, 0)), 0)::integer as unshipped_amount
  from inventory_allocations ia
  where ia.post_id in (select id from target_posts)
), inventory_summary as (
  select
    count(*) filter (
      where coalesce(ii.current_stock, 0) < 0
         or coalesce(ii.allocated_stock, 0) < 0
         or coalesce(ii.allocated_stock, 0) > coalesce(ii.current_stock, 0)
    )::integer as invalid_stock_count
  from inventory_items ii
  where ii.product_code in (
    select distinct product_code
    from target_posts
    where nullif(trim(coalesce(product_code, '')), '') is not null
  )
)
select
  'post_exists' as check_name,
  case when post_count > 0 then 'PASSED' else 'FAILED' end as result,
  post_count as actual_count,
  'Deleted target order still exists as a soft-deleted posts row.' as message
from post_summary
union all
select
  'post_soft_deleted' as check_name,
  case
    when post_count > 0
     and deleted_post_count = post_count
     and active_post_count = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  deleted_post_count as actual_count,
  'posts.delete is true for the target order, and no active duplicate remains.' as message
from post_summary
union all
select
  'order_processes_deleted' as check_name,
  case when remaining_count = 0 then 'PASSED' else 'FAILED' end as result,
  remaining_count as actual_count,
  'order_processes linked to the target order were deleted.' as message
from order_process_summary
union all
select
  'production_results_deleted' as check_name,
  case when remaining_count = 0 then 'PASSED' else 'FAILED' end as result,
  remaining_count as actual_count,
  'production_results linked to the target order were deleted.' as message
from production_result_summary
union all
select
  'production_schedules_deleted' as check_name,
  case when remaining_count = 0 then 'PASSED' else 'FAILED' end as result,
  remaining_count as actual_count,
  'production_schedules linked by post_id or order_no were deleted.' as message
from production_schedule_summary
union all
select
  'shipments_deleted' as check_name,
  case when remaining_count = 0 then 'PASSED' else 'FAILED' end as result,
  remaining_count as actual_count,
  'shipments linked by post_id or order_no were deleted.' as message
from shipment_summary
union all
select
  'inventory_allocations_deleted' as check_name,
  case
    when remaining_count = 0
     and unshipped_amount = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  remaining_count as actual_count,
  'inventory_allocations linked to the target order were deleted.' as message
from allocation_summary
union all
select
  'inventory_stock_valid' as check_name,
  case when invalid_stock_count = 0 then 'PASSED' else 'FAILED' end as result,
  invalid_stock_count as actual_count,
  'Inventory stock remains non-negative and allocated_stock is not greater than current_stock.' as message
from inventory_summary;
