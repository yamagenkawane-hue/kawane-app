-- Active work-screen visibility diagnostic.
--
-- Purpose:
-- - Confirm that deleted orders do not keep related working rows.
-- - Show how many stored rows are linked to orders that are no longer active
--   backorders. Those INFO rows are not necessarily DB errors; the UI/API
--   should hide them from work screens.
--
-- Active backorder rule used here matches the current work-screen APIs:
-- - posts.delete is not true
-- - final order process completed_amount is less than order_amount
-- - shipped amount is less than order_amount
--
-- Expected result:
-- - Rows with result = PASSED are hard checks.
-- - Rows with result = INFO are diagnostic counts.
-- - No row should have result = FAILED.

with shipments_by_post as (
  select
    post_id,
    coalesce(sum(quantity), 0)::integer as shipped_amount
  from shipments
  where post_id is not null
  group by post_id
), ranked_processes as (
  select
    op.*,
    row_number() over (
      partition by op.post_id
      order by op.process_order desc, op.created_at desc, op.id desc
    ) as rn
  from order_processes op
  where op.post_id is not null
), final_processes as (
  select
    post_id,
    coalesce(completed_amount, 0)::integer as completed_amount
  from ranked_processes
  where rn = 1
), active_posts as (
  select
    p.id,
    p.order_no
  from posts p
  left join shipments_by_post sbp on sbp.post_id = p.id
  left join final_processes fp on fp.post_id = p.id
  where coalesce(p."delete", false) = false
    and coalesce(p.order_amount, 0) > coalesce(fp.completed_amount, 0)
    and coalesce(sbp.shipped_amount, 0) < coalesce(p.order_amount, 0)
), inactive_posts as (
  select p.id, p.order_no
  from posts p
  where not exists (
    select 1
    from active_posts ap
    where ap.id = p.id
  )
), deleted_posts as (
  select p.id, p.order_no
  from posts p
  where coalesce(p."delete", false) = true
), deleted_post_related_rows as (
  select count(*)::integer as row_count
  from (
    select op.id::text as id
    from order_processes op
    join deleted_posts dp on dp.id = op.post_id
    union all
    select pr.id::text as id
    from production_results pr
    join deleted_posts dp on dp.id = pr.post_id
    union all
    select ps.id::text as id
    from production_schedules ps
    join deleted_posts dp
      on dp.id = ps.post_id
      or (
        nullif(trim(coalesce(ps.order_no, '')), '') is not null
        and ps.order_no = dp.order_no
      )
    union all
    select s.id::text as id
    from shipments s
    join deleted_posts dp
      on dp.id = s.post_id
      or (
        nullif(trim(coalesce(s.order_no, '')), '') is not null
        and s.order_no = dp.order_no
      )
    union all
    select ia.id::text as id
    from inventory_allocations ia
    join deleted_posts dp on dp.id = ia.post_id
  ) related
), inactive_schedule_rows as (
  select count(*)::integer as row_count
  from production_schedules ps
  join inactive_posts ip
    on ip.id = ps.post_id
    or (
      nullif(trim(coalesce(ps.order_no, '')), '') is not null
      and ps.order_no = ip.order_no
    )
), inactive_order_process_rows as (
  select count(*)::integer as row_count
  from order_processes op
  join inactive_posts ip on ip.id = op.post_id
), inactive_result_rows as (
  select count(*)::integer as row_count
  from production_results pr
  join inactive_posts ip on ip.id = pr.post_id
), orphan_schedule_rows as (
  select count(*)::integer as row_count
  from production_schedules ps
  where ps.post_id is not null
    and not exists (
      select 1
      from posts p
      where p.id = ps.post_id
    )
), orphan_process_rows as (
  select count(*)::integer as row_count
  from order_processes op
  where op.post_id is null
     or not exists (
       select 1
       from posts p
       where p.id = op.post_id
     )
), orphan_result_rows as (
  select count(*)::integer as row_count
  from production_results pr
  where pr.post_id is null
     or not exists (
       select 1
       from posts p
       where p.id = pr.post_id
     )
), summary as (
  select
    (select count(*)::integer from active_posts) as active_post_count,
    (select count(*)::integer from inactive_posts) as inactive_post_count
)
select
  'active_backorder_count' as check_name,
  'INFO' as result,
  active_post_count as actual_count,
  'Current active backorders that work screens should use as their base.' as message
from summary
union all
select
  'inactive_post_count' as check_name,
  'INFO' as result,
  inactive_post_count as actual_count,
  'Deleted, final-process-completed, or fully shipped orders that work screens should not show as active work.' as message
from summary
union all
select
  'deleted_posts_have_no_work_rows' as check_name,
  case when row_count = 0 then 'PASSED' else 'FAILED' end as result,
  row_count as actual_count,
  'Deleted posts should not keep order processes, results, schedules, shipments, or allocations.' as message
from deleted_post_related_rows
union all
select
  'production_schedules_linked_to_inactive_posts' as check_name,
  'INFO' as result,
  row_count as actual_count,
  'Stored schedules linked to inactive posts. Work-screen APIs should hide these rows.' as message
from inactive_schedule_rows
union all
select
  'order_processes_linked_to_inactive_posts' as check_name,
  'INFO' as result,
  row_count as actual_count,
  'Stored order processes linked to inactive posts. Work screens should hide these rows.' as message
from inactive_order_process_rows
union all
select
  'production_results_linked_to_inactive_posts' as check_name,
  'INFO' as result,
  row_count as actual_count,
  'Stored production results linked to inactive posts. These may be history, not active work.' as message
from inactive_result_rows
union all
select
  'production_schedules_without_post' as check_name,
  case when row_count = 0 then 'PASSED' else 'FAILED' end as result,
  row_count as actual_count,
  'production_schedules.post_id should refer to an existing post when it is set.' as message
from orphan_schedule_rows
union all
select
  'order_processes_without_post' as check_name,
  case when row_count = 0 then 'PASSED' else 'FAILED' end as result,
  row_count as actual_count,
  'order_processes must refer to an existing post.' as message
from orphan_process_rows
union all
select
  'production_results_without_post' as check_name,
  case when row_count = 0 then 'PASSED' else 'FAILED' end as result,
  row_count as actual_count,
  'production_results must refer to an existing post.' as message
from orphan_result_rows;
