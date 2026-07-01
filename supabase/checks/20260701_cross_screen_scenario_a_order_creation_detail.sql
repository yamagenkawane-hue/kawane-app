-- Detail query for cross-screen scenario A.
--
-- Replace target_order_no with the order number registered from the order
-- entry screen, then run this when scenario A has FAILED rows.

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_post as (
  select p.*
  from posts p
  join params on params.target_order_no = p.order_no
), master_processes as (
  select
    pp.id,
    pp.product_id,
    pp.product_code,
    pp.process_name,
    pp.process_order,
    pp.subcontractor_id
  from product_processes pp
  join target_post tp
    on (
      (tp.product_id is not null and pp.product_id = tp.product_id)
      or pp.product_code = tp.product_code
    )
), order_process_rows as (
  select
    op.id,
    op.post_id,
    op.product_id,
    op.customer_id,
    op.product_process_id,
    op.process_name,
    op.process_order,
    op.planned_amount,
    op.completed_amount
  from order_processes op
  join target_post tp on tp.id = op.post_id
)
select
  'target_post' as section,
  tp.order_no,
  tp.product_code,
  tp.product_name,
  tp.customer_name,
  tp.product_id::text,
  tp.customer_id::text,
  tp.order_amount::text as amount,
  null::text as process_name,
  null::integer as process_order,
  null::text as product_process_id
from target_post tp
union all
select
  'master_process' as section,
  tp.order_no,
  mp.product_code,
  tp.product_name,
  tp.customer_name,
  mp.product_id::text,
  tp.customer_id::text,
  null::text as amount,
  mp.process_name,
  mp.process_order,
  mp.id::text as product_process_id
from master_processes mp
cross join target_post tp
union all
select
  'order_process' as section,
  tp.order_no,
  tp.product_code,
  tp.product_name,
  tp.customer_name,
  op.product_id::text,
  op.customer_id::text,
  op.planned_amount::text as amount,
  op.process_name,
  op.process_order,
  op.product_process_id::text
from order_process_rows op
cross join target_post tp
order by section, process_order nulls first, process_name;
