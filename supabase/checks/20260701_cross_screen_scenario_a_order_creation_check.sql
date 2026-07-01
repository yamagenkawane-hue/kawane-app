-- Cross-screen scenario A check: order registration to order_processes.
--
-- Replace the value in target_order_no with the order number registered from
-- the order entry screen, then run this script.
--
-- Expected result:
-- - All rows have result = PASSED.

with params as (
  select 'REPLACE_WITH_ORDER_NO'::text as target_order_no
), target_post as (
  select p.*
  from posts p
  join params on params.target_order_no = p.order_no
), process_summary as (
  select
    op.post_id,
    count(*)::integer as process_count,
    count(distinct op.process_order)::integer as distinct_process_order_count,
    min(op.process_order)::integer as min_process_order,
    max(op.process_order)::integer as max_process_order,
    string_agg(op.process_name || ':' || op.process_order::text, ' > ' order by op.process_order) as process_orders,
    count(*) filter (where op.product_id = tp.product_id)::integer as matching_product_id_count,
    count(*) filter (where op.customer_id = tp.customer_id)::integer as matching_customer_id_count,
    count(*) filter (where op.product_process_id is not null)::integer as linked_product_process_count
  from order_processes op
  join target_post tp on tp.id = op.post_id
  group by op.post_id
), expected_master_count as (
  select
    count(*)::integer as process_count,
    string_agg(process_name || ':' || process_order::text, ' > ' order by process_order) as process_orders
  from (
    select distinct on (pp.process_order)
      pp.process_name,
      pp.process_order
    from target_post tp
    join product_processes pp
      on (
        (tp.product_id is not null and pp.product_id = tp.product_id)
        or pp.product_code = tp.product_code
      )
    order by pp.process_order, pp.updated_at desc nulls last, pp.created_at desc nulls last
  ) master_processes
)
select
  'post_exists' as check_name,
  case when exists (select 1 from target_post) then 'PASSED' else 'FAILED' end as result,
  (select count(*) from target_post)::integer as actual_count,
  '受注登録画面で登録した注番が posts に存在すること' as message
union all
select
  'post_master_ids_present' as check_name,
  case
    when exists (
      select 1
      from target_post
      where product_id is not null
        and customer_id is not null
    )
    then 'PASSED'
    else 'FAILED'
  end as result,
  (
    select count(*)
    from target_post
    where product_id is not null
      and customer_id is not null
  )::integer as actual_count,
  'posts.product_id / posts.customer_id が入っていること' as message
union all
select
  'order_processes_created' as check_name,
  case
    when coalesce(ps.process_count, 0) > 0
     and coalesce(ps.process_count, 0) = coalesce(emc.process_count, 0)
    then 'PASSED'
    else 'FAILED'
  end as result,
  coalesce(ps.process_count, 0) as actual_count,
  '製品工程マスタ件数と同じ受注別工程が作成されていること / expected='
    || coalesce(emc.process_count::text, '0')
    || ' master=[' || coalesce(emc.process_orders, '') || ']'
    || ' actual=[' || coalesce(ps.process_orders, '') || ']' as message
from expected_master_count emc
left join process_summary ps on true
union all
select
  'process_orders_gapless' as check_name,
  case
    when coalesce(ps.process_count, 0) > 0
     and ps.distinct_process_order_count = ps.process_count
     and ps.min_process_order = 1
     and ps.max_process_order = ps.process_count
    then 'PASSED'
    else 'FAILED'
  end as result,
  coalesce(ps.process_count, 0) as actual_count,
  '工程順が1から連番で重複していないこと / actual=['
    || coalesce(ps.process_orders, '')
    || ']' as message
from process_summary ps
union all
select
  'process_master_ids_match_post' as check_name,
  case
    when ps.process_count > 0
     and ps.matching_product_id_count = ps.process_count
     and ps.matching_customer_id_count = ps.process_count
    then 'PASSED'
    else 'FAILED'
  end as result,
  coalesce(ps.process_count, 0) as actual_count,
  'order_processes.product_id / customer_id が対象受注と一致すること' as message
from process_summary ps
union all
select
  'product_process_links_present' as check_name,
  case
    when ps.process_count > 0
     and ps.linked_product_process_count = ps.process_count
    then 'PASSED'
    else 'FAILED'
  end as result,
  coalesce(ps.linked_product_process_count, 0) as actual_count,
  'order_processes.product_process_id が製品工程マスタに紐づくこと' as message
from process_summary ps;
