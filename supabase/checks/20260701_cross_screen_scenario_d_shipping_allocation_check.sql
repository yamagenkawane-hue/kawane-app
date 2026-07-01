-- Cross-screen scenario D check: inventory allocation to shipment.
--
-- Replace target_order_no with the order number used in scenario D, then run
-- this after confirming inventory allocation and registering shipment from the UI.
--
-- Expected result:
-- - All rows have result = PASSED.

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_post as (
  select p.*
  from posts p
  join params on params.target_order_no = p.order_no
), post_summary as (
  select
    count(*)::integer as post_count,
    coalesce(max(order_amount), 0)::integer as order_amount
  from target_post
), allocation_summary as (
  select
    count(ia.id)::integer as allocation_count,
    coalesce(sum(ia.allocated_amount), 0)::integer as allocated_amount,
    coalesce(sum(ia.shipped_amount), 0)::integer as allocation_shipped_amount,
    count(*) filter (
      where ia.inventory_item_id is null
        and coalesce(ia.allocated_amount, 0) > coalesce(ia.shipped_amount, 0)
    )::integer as unshipped_without_inventory_count,
    count(*) filter (
      where coalesce(ia.shipped_amount, 0) > coalesce(ia.allocated_amount, 0)
    )::integer as shipped_over_allocated_count
  from inventory_allocations ia
  join target_post tp on tp.id = ia.post_id
), shipment_summary as (
  select
    count(s.id)::integer as shipment_count,
    coalesce(sum(s.quantity), 0)::integer as shipment_amount,
    count(*) filter (
      where s.quantity <= 0
    )::integer as invalid_quantity_count
  from shipments s
  join target_post tp on tp.id = s.post_id
), inventory_summary as (
  select
    count(ii.id)::integer as inventory_item_count,
    coalesce(sum(ii.current_stock), 0)::integer as current_stock,
    coalesce(sum(ii.allocated_stock), 0)::integer as allocated_stock,
    count(*) filter (
      where coalesce(ii.allocated_stock, 0) < 0
         or coalesce(ii.current_stock, 0) < 0
         or coalesce(ii.allocated_stock, 0) > coalesce(ii.current_stock, 0)
    )::integer as invalid_stock_count
  from inventory_items ii
  join target_post tp
    on ii.product_code = tp.product_code
)
select
  'post_exists' as check_name,
  case when post_count > 0 then 'PASSED' else 'FAILED' end as result,
  post_count as actual_count,
  'Target order exists in posts.' as message
from post_summary
union all
select
  'inventory_allocation_exists' as check_name,
  case
    when allocation_count > 0
     and allocated_amount > 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  allocation_count as actual_count,
  'Inventory allocation was created for the target order.' as message
from allocation_summary
union all
select
  'allocation_links_valid' as check_name,
  case
    when allocation_count > 0
     and unshipped_without_inventory_count = 0
     and shipped_over_allocated_count = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  (unshipped_without_inventory_count + shipped_over_allocated_count)::integer as actual_count,
  'Unshipped allocations keep an inventory link, and shipped_amount does not exceed allocated_amount.' as message
from allocation_summary
union all
select
  'shipment_exists' as check_name,
  case
    when shipment_count > 0
     and shipment_amount > 0
     and invalid_quantity_count = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  shipment_count as actual_count,
  'Shipment was registered for the target order.' as message
from shipment_summary
union all
select
  'shipment_matches_allocation' as check_name,
  case
    when shipment_amount > 0
     and shipment_amount = allocation_shipped_amount
    then 'PASSED'
    else 'FAILED'
  end as result,
  shipment_amount as actual_count,
  'Shipment quantity matches inventory_allocations.shipped_amount.' as message
from shipment_summary
cross join allocation_summary
union all
select
  'shipment_within_allocated_amount' as check_name,
  case
    when shipment_amount > 0
     and shipment_amount <= allocated_amount
    then 'PASSED'
    else 'FAILED'
  end as result,
  allocated_amount as actual_count,
  'Shipment quantity does not exceed allocated inventory.' as message
from shipment_summary
cross join allocation_summary
union all
select
  'shipment_within_order_amount' as check_name,
  case
    when ss.shipment_amount > 0
     and ss.shipment_amount <= ps.order_amount
    then 'PASSED'
    else 'FAILED'
  end as result,
  ss.shipment_amount as actual_count,
  'Shipment quantity does not exceed order amount.' as message
from shipment_summary ss
cross join post_summary ps
union all
select
  'inventory_stock_valid' as check_name,
  case
    when invalid_stock_count = 0
     and current_stock >= allocated_stock
    then 'PASSED'
    else 'FAILED'
  end as result,
  invalid_stock_count as actual_count,
  'Inventory stock remains non-negative and allocated_stock is not greater than current_stock.' as message
from inventory_summary;
