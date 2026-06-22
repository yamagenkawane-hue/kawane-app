-- Sync historical manufacturing schedule/results into the first order process.
-- This fixes cases where progress shows manufacturing completed but
-- order_processes.completed_amount is still 0.

select create_order_processes_for_post(ps.post_id)
from production_schedules ps
where ps.post_id is not null;

with first_process as (
  select distinct on (op.post_id)
    op.id,
    op.post_id,
    op.planned_amount,
    op.completed_amount
  from order_processes op
  order by op.post_id, op.process_order
),
schedule_totals as (
  select
    ps.post_id,
    sum(coalesce(ps.press_completed_amount, 0))::integer as completed_amount,
    max(ps.press_completed_date) as completed_date
  from production_schedules ps
  where ps.post_id is not null
  group by ps.post_id
),
result_totals as (
  select
    ps.post_id,
    sum(coalesce(pr.amount, 0))::integer as completed_amount,
    max(pr.date) as completed_date
  from production_results pr
  join production_schedules ps
    on ps.id = pr.schedule_id
  where ps.post_id is not null
    and (
      pr.order_process_id is null
      or pr.process_id = 'manufacturing'
    )
  group by ps.post_id
),
sync_totals as (
  select
    fp.id,
    least(
      fp.planned_amount,
      greatest(
        coalesce(fp.completed_amount, 0),
        coalesce(st.completed_amount, 0),
        coalesce(rt.completed_amount, 0)
      )
    ) as completed_amount,
    coalesce(rt.completed_date, st.completed_date) as completed_date
  from first_process fp
  left join schedule_totals st
    on st.post_id = fp.post_id
  left join result_totals rt
    on rt.post_id = fp.post_id
)
update order_processes op
set completed_amount = sync_totals.completed_amount,
    completed_date = case
      when sync_totals.completed_amount > 0 then sync_totals.completed_date
      else op.completed_date
    end,
    updated_at = now()
from sync_totals
where op.id = sync_totals.id
  and sync_totals.completed_amount > coalesce(op.completed_amount, 0);

with first_process as (
  select distinct on (op.post_id)
    op.id,
    op.post_id,
    op.process_name
  from order_processes op
  order by op.post_id, op.process_order
)
update production_results pr
set post_id = coalesce(pr.post_id, ps.post_id),
    order_process_id = coalesce(pr.order_process_id, fp.id),
    process_id = coalesce(nullif(pr.process_id, 'manufacturing'), fp.id::text),
    process_name = coalesce(pr.process_name, fp.process_name)
from production_schedules ps
join first_process fp
  on fp.post_id = ps.post_id
where pr.schedule_id = ps.id
  and ps.post_id is not null
  and (
    pr.post_id is null
    or pr.order_process_id is null
    or pr.process_id = 'manufacturing'
  );
