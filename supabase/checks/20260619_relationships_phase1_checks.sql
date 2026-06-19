-- Optional checks after running supabase/migrations/20260619_relationships_phase1.sql.
-- These queries do not change data.

select 'posts_without_product_id' as check_name, count(*) as count
from posts
where product_id is null;

select 'posts_without_customer_id' as check_name, count(*) as count
from posts
where customer_id is null;

select 'product_master_without_customer_id' as check_name, count(*) as count
from product_master
where customer_id is null;

select 'product_processes_without_product_id' as check_name, count(*) as count
from product_processes
where product_id is null;

select 'product_processes_without_process_master_id' as check_name, count(*) as count
from product_processes
where process_master_id is null;

select 'order_processes_without_product_process_id' as check_name, count(*) as count
from order_processes
where product_process_id is null;

select 'inventory_items_without_product_id' as check_name, count(*) as count
from inventory_items
where product_id is null;

select 'unmatched_posts_product' as check_name, p.id, p.order_no, p.product_code, p.product_name
from posts p
where p.product_id is null
order by p.created_at desc nulls last;

select 'unmatched_posts_customer' as check_name, p.id, p.order_no, p.customer_name
from posts p
where p.customer_id is null
order by p.created_at desc nulls last;

select 'unmatched_product_processes' as check_name, pp.id, pp.product_code, pp.process_name, pp.process_order
from product_processes pp
where pp.product_id is null
   or pp.process_master_id is null
order by pp.product_code, pp.process_order;
