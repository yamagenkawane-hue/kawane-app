-- Detail query for cross-screen scenario B.
--
-- Replace target_order_no with the order number used in scenario B.
-- Use this when scenario B has FAILED rows to see the order processes and
-- production_results currently stored for the target order.

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_post as (
  select p.*
  from posts p
  join params on params.target_order_no = p.order_no
), process_rows as (
  select
    op.id,
    op.post_id,
    op.process_name,
    op.process_order,
    op.planned_amount,
    op.completed_amount,
    op.completed_date
  from order_processes op
  join target_post tp on tp.id = op.post_id
), result_rows as (
  select
    pr.id,
    pr.post_id,
    pr.order_process_id,
    pr.process_name,
    pr.date,
    pr.amount,
    pr.created_at
  from production_results pr
  join target_post tp on tp.id = pr.post_id
)
select
  'target_post' as section,
  tp.order_no,
  tp.lot_no,
  tp.product_code,
  tp.product_name,
  tp.customer_name,
  null::text as order_process_id,
  null::integer as process_order,
  null::text as process_name,
  null::integer as planned_amount,
  null::integer as completed_amount,
  null::date as result_date,
  null::integer as result_amount,
  '対象受注' as message
from target_post tp
union all
select
  'order_process' as section,
  tp.order_no,
  tp.lot_no,
  tp.product_code,
  tp.product_name,
  tp.customer_name,
  pr.id::text as order_process_id,
  pr.process_order,
  pr.process_name,
  pr.planned_amount,
  pr.completed_amount,
  pr.completed_date as result_date,
  null::integer as result_amount,
  case
    when pr.completed_amount > 0 then '実績登録済み'
    else '未実績'
  end as message
from process_rows pr
cross join target_post tp
union all
select
  'production_result' as section,
  tp.order_no,
  tp.lot_no,
  tp.product_code,
  tp.product_name,
  tp.customer_name,
  rr.order_process_id::text,
  pr.process_order,
  coalesce(pr.process_name, rr.process_name),
  pr.planned_amount,
  pr.completed_amount,
  rr.date as result_date,
  rr.amount as result_amount,
  '登録済み実績' as message
from result_rows rr
cross join target_post tp
left join process_rows pr on pr.id = rr.order_process_id
order by section, process_order nulls first, result_date nulls last;
