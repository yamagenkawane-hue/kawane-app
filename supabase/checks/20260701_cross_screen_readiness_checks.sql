-- Read-only checks before running the cross-screen manual test.
--
-- Expected result:
-- - All rows with check_type = 'count' have count = 0.
-- - rls_status rows are informational.

select 'count' as check_type, 'active_posts_without_order_processes' as check_name, count(*) as count
from posts p
where coalesce(p."delete", false) = false
  and not exists (
    select 1
    from order_processes op
    where op.post_id = p.id
  );

select 'count' as check_type, 'order_processes_without_post' as check_name, count(*) as count
from order_processes op
left join posts p on p.id = op.post_id
where op.post_id is null or p.id is null;

select 'count' as check_type, 'order_processes_without_product_id' as check_name, count(*) as count
from order_processes op
join posts p on p.id = op.post_id
where coalesce(p."delete", false) = false
  and op.product_id is null;

select 'count' as check_type, 'order_processes_without_customer_id' as check_name, count(*) as count
from order_processes op
join posts p on p.id = op.post_id
where coalesce(p."delete", false) = false
  and op.customer_id is null;

select 'count' as check_type, 'production_results_without_post' as check_name, count(*) as count
from production_results pr
left join posts p on p.id = pr.post_id
where pr.post_id is null or p.id is null;

select 'count' as check_type, 'production_results_without_order_process' as check_name, count(*) as count
from production_results pr
left join order_processes op on op.id = pr.order_process_id
where pr.order_process_id is null or op.id is null;

select 'count' as check_type, 'production_result_amount_mismatch' as check_name, count(*) as count
from order_processes op
join (
  select order_process_id, sum(coalesce(amount, 0))::integer as result_amount
  from production_results
  where order_process_id is not null
  group by order_process_id
) pr on pr.order_process_id = op.id
where coalesce(op.completed_amount, 0) <> coalesce(pr.result_amount, 0);

select 'count' as check_type, 'inventory_items_negative_or_over_allocated' as check_name, count(*) as count
from inventory_items
where coalesce(current_stock, 0) < 0
   or coalesce(allocated_stock, 0) < 0
   or coalesce(allocated_stock, 0) > coalesce(current_stock, 0);

select 'count' as check_type, 'inventory_allocations_without_post' as check_name, count(*) as count
from inventory_allocations ia
left join posts p on p.id = ia.post_id
where ia.post_id is null or p.id is null;

select 'count' as check_type, 'unshipped_inventory_allocations_without_inventory_item' as check_name, count(*) as count
from inventory_allocations ia
left join inventory_items ii on ii.id = ia.inventory_item_id
where coalesce(ia.allocated_amount, 0) > coalesce(ia.shipped_amount, 0)
  and (ia.inventory_item_id is null or ii.id is null);

select 'count' as check_type, 'inventory_allocations_shipped_over_allocated' as check_name, count(*) as count
from inventory_allocations
where coalesce(shipped_amount, 0) > coalesce(allocated_amount, 0);

select 'count' as check_type, 'shipments_without_post' as check_name, count(*) as count
from shipments s
left join posts p on p.id = s.post_id
where s.post_id is null or p.id is null;

select 'count' as check_type, 'shipments_quantity_over_order_amount' as check_name, count(*) as count
from (
  select
    p.id,
    coalesce(p.order_amount, 0) as order_amount,
    coalesce(sum(s.quantity), 0) as shipped_amount
  from posts p
  join shipments s on s.post_id = p.id
  group by p.id, p.order_amount
) shipped
where shipped_amount > order_amount;

select
  'rls_status' as check_type,
  relname as check_name,
  case when relrowsecurity then 1 else 0 end as count
from pg_class
where relname in (
  'posts',
  'order_processes',
  'production_results',
  'inventory_items',
  'inventory_allocations',
  'shipments'
)
order by relname;
