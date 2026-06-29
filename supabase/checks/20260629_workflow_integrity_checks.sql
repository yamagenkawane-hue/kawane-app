-- Workflow integrity checks for the posts/order_processes/production_results
-- centered implementation. Run in Supabase SQL Editor and investigate any
-- result rows where count is greater than 0.

select 'order_processes_without_post' as check_name, count(*) as count
from order_processes op
left join posts p on p.id = op.post_id
where op.post_id is null or p.id is null;

select 'production_results_without_post' as check_name, count(*) as count
from production_results pr
left join posts p on p.id = pr.post_id
where pr.post_id is null or p.id is null;

select 'production_results_without_order_process' as check_name, count(*) as count
from production_results pr
left join order_processes op on op.id = pr.order_process_id
where pr.order_process_id is null or op.id is null;

select 'order_processes_without_product_id' as check_name, count(*) as count
from order_processes
where product_id is null;

select 'order_processes_without_customer_id' as check_name, count(*) as count
from order_processes
where customer_id is null;

select 'production_result_amount_mismatch' as check_name, count(*) as count
from order_processes op
join (
  select order_process_id, sum(coalesce(amount, 0))::integer as result_amount
  from production_results
  where order_process_id is not null
  group by order_process_id
) pr on pr.order_process_id = op.id
where coalesce(op.completed_amount, 0) <> coalesce(pr.result_amount, 0);

select 'order_processes_completed_over_planned' as check_name, count(*) as count
from order_processes
where coalesce(completed_amount, 0) > coalesce(planned_amount, 0);

select 'packaging_completed_without_lot_no' as check_name, count(*) as count
from order_processes op
join posts p on p.id = op.post_id
where (op.process_name like '%梱包%' or op.process_name like '%包装%')
  and coalesce(op.completed_amount, 0) > 0
  and nullif(trim(coalesce(p.lot_no, '')), '') is null;

select 'packaging_completed_without_inventory' as check_name, count(*) as count
from order_processes op
join posts p on p.id = op.post_id
where (op.process_name like '%梱包%' or op.process_name like '%包装%')
  and coalesce(op.completed_amount, 0) > 0
  and nullif(trim(coalesce(p.lot_no, '')), '') is not null
  and not exists (
    select 1
    from inventory_items ii
    where ii.lot_no = p.lot_no
      and (
        (op.product_id is not null and ii.product_id = op.product_id)
        or ii.product_code = op.product_code
      )
  );

select 'inventory_allocated_over_stock' as check_name, count(*) as count
from inventory_items
where coalesce(allocated_stock, 0) > coalesce(current_stock, 0);

select
  'rls_status' as check_name,
  relname as table_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
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

select
  'rls_policy' as check_name,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where tablename in (
  'posts',
  'order_processes',
  'production_results',
  'inventory_items',
  'inventory_allocations',
  'shipments'
)
order by tablename, policyname;
