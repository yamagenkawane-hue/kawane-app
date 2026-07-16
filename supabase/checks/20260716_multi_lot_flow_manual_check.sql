-- Manual check for the multi-lot flow.
--
-- Usage:
-- 1. Pick one active order that still has quantity to produce.
-- 2. Register measurement twice for the same order with different material_lot_no values.
-- 3. Optionally register packaging for each lot.
-- 4. Update target_order_no below, then run this SQL.

with params as (
  select
    'DEMO-ORD-006'::text as target_order_no,
    2::integer as expected_lot_count
),
target_lots as (
  select v.*
  from v_lot_flow_status v
  join params p on p.target_order_no = v.order_no
),
target_post as (
  select p.*
  from posts p
  join params prm on prm.target_order_no = p.order_no
  where coalesce(p.delete, false) = false
  order by p.created_at desc
  limit 1
),
summary as (
  select
    count(*)::integer as lot_count,
    count(distinct nullif(trim(coalesce(material_lot_no, '')), ''))::integer as material_lot_count,
    coalesce(sum(measured_amount), 0)::integer as measured_total,
    coalesce(sum(packaged_amount), 0)::integer as packaged_total,
    coalesce(sum(inventory_amount), 0)::integer as inventory_total,
    coalesce(sum(allocated_amount), 0)::integer as allocated_total,
    coalesce(sum(shipped_amount), 0)::integer as shipped_total,
    coalesce(sum(remaining_amount), 0)::integer as remaining_total,
    count(*) filter (where packaged_amount > measured_amount)::integer as over_packaged_count,
    count(*) filter (where inventory_amount > packaged_amount)::integer as inventory_over_packaged_count
  from target_lots
)
select
  'target_post_exists' as check_name,
  case when exists (select 1 from target_post) then 'PASSED' else 'FAILED' end as result,
  (select count(*) from target_post)::integer as actual_count,
  'Target order exists and is active in posts.' as message
union all
select
  'multi_lot_count' as check_name,
  case
    when (select lot_count from summary) >= (select expected_lot_count from params)
      then 'PASSED'
    else 'FAILED'
  end as result,
  (select lot_count from summary) as actual_count,
  'The target order has at least the expected number of lot rows.' as message
union all
select
  'material_lots_separated' as check_name,
  case
    when (select material_lot_count from summary) >= (select expected_lot_count from params)
      then 'PASSED'
    else 'FAILED'
  end as result,
  (select material_lot_count from summary) as actual_count,
  'Different material lots are tracked separately for the same order.' as message
union all
select
  'measured_total_vs_order_amount' as check_name,
  'INFO' as result,
  (select measured_total from summary) as actual_count,
  concat(
    'Measured total can exceed order amount when the first process is explicitly overproduced. order_amount=',
    coalesce((select order_amount from target_post), 0)
  ) as message
union all
select
  'packaged_not_over_measured' as check_name,
  case when (select over_packaged_count from summary) = 0 then 'PASSED' else 'FAILED' end as result,
  (select over_packaged_count from summary) as actual_count,
  'No lot is packaged over its measured amount.' as message
union all
select
  'inventory_not_over_packaged' as check_name,
  case
    when (select inventory_over_packaged_count from summary) = 0
      then 'PASSED'
    else 'FAILED'
  end as result,
  (select inventory_over_packaged_count from summary) as actual_count,
  'No lot has inventory over its packaged amount.' as message
union all
select
  'flow_summary' as check_name,
  'INFO' as result,
  (select measured_total from summary) as actual_count,
  concat(
    'measured=', (select measured_total from summary),
    ', packaged=', (select packaged_total from summary),
    ', inventory=', (select inventory_total from summary),
    ', allocated=', (select allocated_total from summary),
    ', shipped=', (select shipped_total from summary),
    ', remaining=', (select remaining_total from summary)
  ) as message
union all
select
  concat('lot_detail:', lot_no) as check_name,
  flow_status as result,
  measured_amount as actual_count,
  concat(
    'material_lot=', coalesce(material_lot_no, '-'),
    ', packaged=', packaged_amount,
    ', inventory=', inventory_amount,
    ', allocated=', allocated_amount,
    ', shipped=', shipped_amount,
    ', remaining=', remaining_amount,
    ', lot_id=', id
  ) as message
from target_lots
order by check_name;
