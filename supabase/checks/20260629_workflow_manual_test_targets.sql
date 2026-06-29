-- Read-only helper queries for choosing records during manual workflow tests.
--
-- Run each section independently in Supabase SQL Editor when you need a target
-- order for screen testing.

-- 1. Measurement candidates:
-- Orders where an inspection process is complete and a measurement process can
-- still accept at least 1 result.
select
  p.order_no,
  p.lot_no,
  op.id as measurement_order_process_id,
  op.product_code,
  op.product_name,
  op.customer_name,
  op.planned_amount,
  op.completed_amount,
  greatest(coalesce(prev.completed_amount, op.planned_amount) - op.completed_amount, 0) as registerable_amount
from order_processes op
join posts p on p.id = op.post_id
left join lateral (
  select completed_amount
  from order_processes
  where post_id = op.post_id
    and process_order < op.process_order
  order by process_order desc
  limit 1
) prev on true
where op.process_name like '%計量%'
  and greatest(coalesce(prev.completed_amount, op.planned_amount) - op.completed_amount, 0) > 0
order by p.delivery_date nulls last, p.order_no
limit 20;

-- 2. Packaging candidates:
-- Orders where a packaging/wrapping process can still accept at least 1 result
-- and a lot number exists, so inventory registration can succeed.
select
  p.order_no,
  p.lot_no,
  op.id as packaging_order_process_id,
  op.product_code,
  op.product_name,
  op.customer_name,
  op.planned_amount,
  op.completed_amount,
  greatest(coalesce(prev.completed_amount, op.planned_amount) - op.completed_amount, 0) as registerable_amount
from order_processes op
join posts p on p.id = op.post_id
left join lateral (
  select completed_amount
  from order_processes
  where post_id = op.post_id
    and process_order < op.process_order
  order by process_order desc
  limit 1
) prev on true
where (op.process_name like '%梱包%' or op.process_name like '%包装%')
  and nullif(trim(coalesce(p.lot_no, '')), '') is not null
  and greatest(coalesce(prev.completed_amount, op.planned_amount) - op.completed_amount, 0) > 0
order by p.delivery_date nulls last, p.order_no
limit 20;

-- 3. Lot-number error candidates:
-- Orders where a packaging/wrapping process can still accept a result, but the
-- order has no lot number. These are useful for confirming the expected error.
select
  p.order_no,
  p.lot_no,
  op.id as packaging_order_process_id,
  op.product_code,
  op.product_name,
  op.customer_name,
  op.planned_amount,
  op.completed_amount,
  greatest(coalesce(prev.completed_amount, op.planned_amount) - op.completed_amount, 0) as registerable_amount
from order_processes op
join posts p on p.id = op.post_id
left join lateral (
  select completed_amount
  from order_processes
  where post_id = op.post_id
    and process_order < op.process_order
  order by process_order desc
  limit 1
) prev on true
where (op.process_name like '%梱包%' or op.process_name like '%包装%')
  and nullif(trim(coalesce(p.lot_no, '')), '') is null
  and greatest(coalesce(prev.completed_amount, op.planned_amount) - op.completed_amount, 0) > 0
order by p.delivery_date nulls last, p.order_no
limit 20;
