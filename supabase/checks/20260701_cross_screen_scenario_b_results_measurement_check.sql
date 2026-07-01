-- Cross-screen scenario B check: result registration to progress,
-- measurement registration, and weighing report source data.
--
-- Replace target_order_no with the order number used in scenario B, then run
-- this after registering process results and a measurement result from the UI.
--
-- Expected result:
-- - All rows have result = PASSED.

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_post as (
  select p.*
  from posts p
  join params on params.target_order_no = p.order_no
), process_rows as (
  select op.*
  from order_processes op
  join target_post tp on tp.id = op.post_id
), result_totals as (
  select
    pr.order_process_id,
    count(*)::integer as result_count,
    sum(coalesce(pr.amount, 0))::integer as result_amount
  from production_results pr
  join target_post tp on tp.id = pr.post_id
  group by pr.order_process_id
), process_summary as (
  select
    count(*)::integer as process_count,
    count(*) filter (
      where coalesce(prs.completed_amount, 0) <> coalesce(rt.result_amount, 0)
    )::integer as mismatch_count,
    count(*) filter (
      where coalesce(prs.completed_amount, 0) > 0
    )::integer as completed_process_count
  from process_rows prs
  left join result_totals rt on rt.order_process_id = prs.id
), result_link_summary as (
  select
    count(*)::integer as result_count,
    count(*) filter (
      where pr.post_id is null
         or pr.order_process_id is null
         or op.id is null
    )::integer as broken_link_count
  from production_results pr
  join target_post tp on tp.id = pr.post_id
  left join order_processes op
    on op.id = pr.order_process_id
   and op.post_id = tp.id
), measurement_summary as (
  select
    count(*)::integer as measurement_result_count,
    coalesce(sum(pr.amount), 0)::integer as measurement_amount
  from production_results pr
  join target_post tp on tp.id = pr.post_id
  join order_processes op on op.id = pr.order_process_id
  where op.process_name like '%計量%'
), weighing_report_summary as (
  select
    count(*)::integer as weighing_report_count,
    coalesce(sum(vpr.amount), 0)::integer as weighing_report_amount
  from v_production_results_with_master vpr
  join target_post tp on tp.id = vpr.post_id
  where vpr.process_name like '%計量%'
), packaging_summary as (
  select coalesce(sum(op.completed_amount), 0)::integer as packaging_amount
  from process_rows op
  where op.process_name like '%梱包%'
     or op.process_name like '%包装%'
), inventory_summary as (
  select coalesce(sum(ii.current_stock), 0)::integer as inventory_stock
  from inventory_items ii
  join target_post tp
    on nullif(trim(coalesce(tp.lot_no, '')), '') is not null
   and ii.lot_no = tp.lot_no
   and (
     (tp.product_id is not null and ii.product_id = tp.product_id)
     or ii.product_code = tp.product_code
   )
)
select
  'post_exists' as check_name,
  case when exists (select 1 from target_post) then 'PASSED' else 'FAILED' end as result,
  (select count(*) from target_post)::integer as actual_count,
  '対象注番が posts に存在すること' as message
union all
select
  'production_results_linked' as check_name,
  case
    when rls.result_count > 0
     and rls.broken_link_count = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  rls.result_count as actual_count,
  'production_results.post_id / order_process_id が対象受注と工程に紐づくこと' as message
from result_link_summary rls
union all
select
  'process_completed_matches_results' as check_name,
  case
    when ps.process_count > 0
     and ps.completed_process_count > 0
     and ps.mismatch_count = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  ps.completed_process_count as actual_count,
  'order_processes.completed_amount が production_results 合計と一致すること' as message
from process_summary ps
union all
select
  'measurement_result_exists' as check_name,
  case
    when ms.measurement_result_count > 0
     and ms.measurement_amount > 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  ms.measurement_result_count as actual_count,
  '計量工程の production_results が登録されていること' as message
from measurement_summary ms
union all
select
  'weighing_report_source_exists' as check_name,
  case
    when wrs.weighing_report_count > 0
     and wrs.weighing_report_amount = ms.measurement_amount
    then 'PASSED'
    else 'FAILED'
  end as result,
  wrs.weighing_report_count as actual_count,
  '計量表出力が参照する v_production_results_with_master に計量実績が出ること' as message
from weighing_report_summary wrs
cross join measurement_summary ms
union all
select
  'measurement_does_not_increase_inventory' as check_name,
  case
    when ms.measurement_amount > 0
     and ps.packaging_amount = 0
     and ins.inventory_stock = 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  ins.inventory_stock as actual_count,
  '梱包前の計量登録だけでは inventory_items.current_stock が増えないこと' as message
from measurement_summary ms
cross join packaging_summary ps
cross join inventory_summary ins;
