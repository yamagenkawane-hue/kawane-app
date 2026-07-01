-- Cross-screen scenario C check: packaging/wrapping registration to inventory.
--
-- Replace target_order_no with the order number used in scenario C, then run
-- this after registering packaging/wrapping results from the UI.
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
), packaging_processes as (
  select *
  from process_rows
  where process_name like '%梱包%'
     or process_name like '%包装%'
), packaging_results as (
  select
    pr.id,
    pr.post_id,
    pr.order_process_id,
    pr.amount
  from production_results pr
  join target_post tp on tp.id = pr.post_id
  join packaging_processes pp on pp.id = pr.order_process_id
), packaging_summary as (
  select
    count(distinct pp.id)::integer as packaging_process_count,
    coalesce(sum(pp.completed_amount), 0)::integer as packaging_completed_amount,
    coalesce(sum(pr.amount), 0)::integer as packaging_result_amount,
    count(pr.id)::integer as packaging_result_count
  from packaging_processes pp
  left join packaging_results pr on pr.order_process_id = pp.id
), measurement_summary as (
  select
    count(*)::integer as measurement_process_count,
    coalesce(sum(op.completed_amount), 0)::integer as measurement_completed_amount
  from process_rows op
  where op.process_name like '%計量%'
), inventory_summary as (
  select
    count(ii.id)::integer as inventory_item_count,
    coalesce(sum(ii.current_stock), 0)::integer as inventory_stock
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
  'lot_no_present' as check_name,
  case
    when exists (
      select 1
      from target_post
      where nullif(trim(coalesce(lot_no, '')), '') is not null
    )
    then 'PASSED'
    else 'FAILED'
  end as result,
  (select count(*) from target_post where nullif(trim(coalesce(lot_no, '')), '') is not null)::integer as actual_count,
  '梱包/包装後の在庫登録に必要な lot_no が対象受注に入っていること' as message
union all
select
  'measurement_completed_before_packaging' as check_name,
  case
    when ms.measurement_process_count > 0
     and ms.measurement_completed_amount > 0
     and ms.measurement_completed_amount >= ps.packaging_completed_amount
    then 'PASSED'
    else 'FAILED'
  end as result,
  ms.measurement_completed_amount as actual_count,
  '梱包/包装前に計量工程が完了していること' as message
from measurement_summary ms
cross join packaging_summary ps
union all
select
  'packaging_result_exists' as check_name,
  case
    when ps.packaging_process_count > 0
     and ps.packaging_result_count > 0
     and ps.packaging_result_amount > 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  ps.packaging_result_count as actual_count,
  '梱包/包装工程の production_results が登録されていること' as message
from packaging_summary ps
union all
select
  'packaging_completed_matches_results' as check_name,
  case
    when ps.packaging_process_count > 0
     and ps.packaging_completed_amount = ps.packaging_result_amount
     and ps.packaging_completed_amount > 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  ps.packaging_completed_amount as actual_count,
  'order_processes.completed_amount が梱包/包装 production_results 合計と一致すること' as message
from packaging_summary ps
union all
select
  'inventory_item_exists' as check_name,
  case
    when ins.inventory_item_count > 0
     and ins.inventory_stock > 0
    then 'PASSED'
    else 'FAILED'
  end as result,
  ins.inventory_item_count as actual_count,
  '対象受注の product / lot_no に対応する inventory_items が存在すること' as message
from inventory_summary ins
union all
select
  'inventory_stock_covers_packaging' as check_name,
  case
    when ps.packaging_completed_amount > 0
     and ins.inventory_stock >= ps.packaging_completed_amount
    then 'PASSED'
    else 'FAILED'
  end as result,
  ins.inventory_stock as actual_count,
  'inventory_items.current_stock が梱包/包装完了数以上になっていること' as message
from inventory_summary ins
cross join packaging_summary ps;
