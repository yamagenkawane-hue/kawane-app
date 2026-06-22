-- Move legacy per-post JSON logs into the new production_results table.
-- This is intentionally additive and idempotent. Legacy columns are kept for rollback/fallback.

with legacy_logs as (
  select
    p.id as post_id,
    'manufacturing' as legacy_process_id,
    '製造' as process_name,
    nullif(log_item->>'date', '')::date as date,
    nullif(log_item->>'amount', '')::integer as amount
  from posts p
  cross join lateral jsonb_array_elements(coalesce(p.manufacturing_logs::jsonb, '[]'::jsonb)) as log_item
  where nullif(log_item->>'date', '') is not null
    and coalesce(nullif(log_item->>'amount', '')::integer, 0) > 0

  union all

  select
    p.id,
    'cleaning',
    '洗浄',
    nullif(log_item->>'date', '')::date,
    nullif(log_item->>'amount', '')::integer
  from posts p
  cross join lateral jsonb_array_elements(coalesce(p.cleaning_logs::jsonb, '[]'::jsonb)) as log_item
  where nullif(log_item->>'date', '') is not null
    and coalesce(nullif(log_item->>'amount', '')::integer, 0) > 0

  union all

  select
    p.id,
    'inspection',
    '検査',
    nullif(log_item->>'date', '')::date,
    nullif(log_item->>'amount', '')::integer
  from posts p
  cross join lateral jsonb_array_elements(coalesce(p.inspection_logs::jsonb, '[]'::jsonb)) as log_item
  where nullif(log_item->>'date', '') is not null
    and coalesce(nullif(log_item->>'amount', '')::integer, 0) > 0

  union all

  select
    p.id,
    'measurement',
    '計量',
    nullif(log_item->>'date', '')::date,
    nullif(log_item->>'amount', '')::integer
  from posts p
  cross join lateral jsonb_array_elements(coalesce(p.measurement_logs::jsonb, '[]'::jsonb)) as log_item
  where nullif(log_item->>'date', '') is not null
    and coalesce(nullif(log_item->>'amount', '')::integer, 0) > 0

  union all

  select
    p.id,
    'packaging',
    '梱包',
    nullif(log_item->>'date', '')::date,
    nullif(log_item->>'amount', '')::integer
  from posts p
  cross join lateral jsonb_array_elements(coalesce(p.packaging_logs::jsonb, '[]'::jsonb)) as log_item
  where nullif(log_item->>'date', '') is not null
    and coalesce(nullif(log_item->>'amount', '')::integer, 0) > 0
),
matched_logs as (
  select
    ll.post_id,
    op.id as order_process_id,
    ll.legacy_process_id,
    coalesce(op.process_name, ll.process_name) as process_name,
    ll.date,
    ll.amount
  from legacy_logs ll
  left join lateral (
    select op_inner.*
    from order_processes op_inner
    where op_inner.post_id = ll.post_id
      and (
        op_inner.process_name = ll.process_name
        or (ll.legacy_process_id = 'manufacturing' and op_inner.process_order = 1)
      )
    order by op_inner.process_order
    limit 1
  ) op on true
)
insert into production_results (
  post_id,
  order_process_id,
  process_id,
  process_name,
  date,
  amount,
  created_at
)
select
  ml.post_id,
  ml.order_process_id,
  coalesce(ml.order_process_id::text, ml.legacy_process_id),
  ml.process_name,
  ml.date,
  ml.amount,
  now()
from matched_logs ml
where not exists (
  select 1
  from production_results pr
  where pr.post_id = ml.post_id
    and coalesce(pr.order_process_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(ml.order_process_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and pr.process_name = ml.process_name
    and pr.date = ml.date
    and pr.amount = ml.amount
);

with result_totals as (
  select
    op.id as order_process_id,
    max(pr.date) as completed_date,
    sum(pr.amount)::integer as completed_amount
  from order_processes op
  join production_results pr
    on pr.post_id = op.post_id
    and (
      pr.order_process_id = op.id
      or pr.process_name = op.process_name
      or (op.process_order = 1 and pr.process_name in ('製造', 'プレス'))
    )
  group by op.id
)
update order_processes op
set
  completed_amount = greatest(coalesce(op.completed_amount, 0), rt.completed_amount),
  completed_date = coalesce(op.completed_date, rt.completed_date),
  updated_at = now()
from result_totals rt
where rt.order_process_id = op.id;
