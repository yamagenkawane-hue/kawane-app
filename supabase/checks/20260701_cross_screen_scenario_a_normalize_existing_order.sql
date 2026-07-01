-- Normalize an existing test order's order_processes.process_order.
--
-- Replace target_order_no with the order number used in scenario A, then run
-- this after applying:
-- supabase/migrations/20260701_normalize_order_process_sequence.sql
--
-- Expected result:
-- - result = PASSED
-- - process_order becomes gapless, such as 製造:1 > メッキ:2

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_post as (
  select p.id, p.order_no
  from posts p
  join params on params.target_order_no = p.order_no
), normalized as (
  select normalize_order_process_sequence_for_post(id)
  from target_post
), process_summary as (
  select
    tp.order_no,
    count(op.*)::integer as process_count,
    count(distinct op.process_order)::integer as distinct_process_order_count,
    min(op.process_order)::integer as min_process_order,
    max(op.process_order)::integer as max_process_order,
    string_agg(op.process_name || ':' || op.process_order::text, ' > ' order by op.process_order) as process_orders
  from target_post tp
  left join order_processes op on op.post_id = tp.id
  group by tp.order_no
)
select
  case
    when process_count > 0
     and distinct_process_order_count = process_count
     and min_process_order = 1
     and max_process_order = process_count
    then 'PASSED'
    else 'FAILED'
  end as result,
  order_no,
  process_count,
  process_orders,
  '受注別工程の工程順を1からの連番へ正規化しました' as message
from process_summary;
