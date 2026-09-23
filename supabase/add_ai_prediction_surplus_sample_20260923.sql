-- AI prediction sample with surplus production.
-- Order quantity: 100, manufactured lots: 80 + 70 = 150.
-- Run the whole script in Supabase SQL Editor.

begin;

set local search_path = public;

delete from ai_prediction_latest
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from ai_prediction_results
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from ai_prediction_input_snapshots
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from ai_prediction_evaluations
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from process_transfer_history
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from lot_process_balance
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from production_results
where post_id in (select id from posts where order_no = 'AI-SURPLUS-001');

delete from lots where order_no = 'AI-SURPLUS-001';
delete from production_schedules where order_no = 'AI-SURPLUS-001';
delete from order_processes where order_no = 'AI-SURPLUS-001';
delete from posts where order_no = 'AI-SURPLUS-001';

insert into posts (
  id,
  order_no,
  lot_no,
  product_code,
  product_name,
  product_id,
  customer_name,
  customer_id,
  order_amount,
  completion_scheduled_date,
  delivery_date,
  remark,
  status,
  delete,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  'AI-SURPLUS-001',
  '',
  pm.product_code,
  pm.product_name,
  pm.id,
  cm.customer_name,
  cm.id,
  100,
  '2026-09-29'::date,
  '2026-10-02'::date,
  'AI予測・余剰ロット検証用（受注100個、製造150個）',
  '進行中',
  false,
  now(),
  now()
from product_master pm
join customer_master cm on cm.id = pm.customer_id
where pm.product_code = 'GROUP-P001';

insert into order_processes (
  id,
  post_id,
  order_no,
  product_code,
  product_name,
  product_id,
  customer_name,
  customer_id,
  process_name,
  process_order,
  planned_amount,
  completed_amount,
  completed_date,
  subcontractor_id,
  product_process_id,
  locked,
  overlap_days,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  p.id,
  p.order_no,
  p.product_code,
  p.product_name,
  p.product_id,
  p.customer_name,
  p.customer_id,
  pp.process_name,
  pp.process_order,
  p.order_amount,
  case when pp.process_order = 1 then 150 else 0 end,
  case when pp.process_order = 1 then '2026-09-22'::date else null end,
  pp.subcontractor_id,
  pp.id,
  false,
  coalesce(pp.overlap_days, 0),
  now(),
  now()
from posts p
join product_processes pp on pp.product_code = p.product_code
where p.order_no = 'AI-SURPLUS-001';

insert into lots (
  id,
  post_id,
  order_no,
  product_id,
  customer_id,
  product_code,
  product_name,
  customer_name,
  lot_no,
  material_lot_no,
  lot_type,
  quantity,
  measured_amount,
  packaged_amount,
  inventory_amount,
  status,
  measured_at,
  packaged_at,
  deleted,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  p.id,
  p.order_no,
  p.product_id,
  p.customer_id,
  p.product_code,
  p.product_name,
  p.customer_name,
  seed.lot_no,
  seed.material_lot_no,
  'normal',
  seed.quantity,
  seed.quantity,
  0,
  0,
  'in_process',
  seed.manufacturing_date,
  null,
  false,
  now(),
  now()
from posts p
cross join (
  values
    ('AI-SURPLUS-001-A', 'AI-MATERIAL-001', 80, '2026-09-21'::date),
    ('AI-SURPLUS-001-B', 'AI-MATERIAL-002', 70, '2026-09-22'::date)
) as seed(lot_no, material_lot_no, quantity, manufacturing_date)
where p.order_no = 'AI-SURPLUS-001';

insert into production_results (
  schedule_id,
  post_id,
  order_process_id,
  lot_id,
  process_id,
  process_name,
  date,
  amount,
  created_at
)
select
  null,
  p.id,
  op.id,
  l.id,
  op.id::text,
  op.process_name,
  l.measured_at::date,
  l.quantity,
  l.measured_at
from posts p
join order_processes op on op.post_id = p.id and op.process_order = 1
join lots l on l.post_id = p.id
where p.order_no = 'AI-SURPLUS-001';

insert into lot_process_balance (
  post_id,
  order_process_id,
  lot_id,
  process_name,
  process_order,
  quantity,
  created_at,
  updated_at
)
select
  p.id,
  op.id,
  l.id,
  op.process_name,
  op.process_order,
  l.quantity,
  now(),
  now()
from posts p
join order_processes op on op.post_id = p.id and op.process_order = 2
join lots l on l.post_id = p.id
where p.order_no = 'AI-SURPLUS-001';

insert into production_schedules (
  post_id,
  order_no,
  product_id,
  customer_id,
  customer_name,
  product_name,
  press_number,
  lot_no,
  plan_amount,
  press_completed_amount,
  press_completed_date,
  shipping_scheduled_start,
  shipping_scheduled_end,
  department,
  created_at,
  updated_at
)
select
  p.id,
  p.order_no,
  p.product_id,
  p.customer_id,
  p.customer_name,
  p.product_name,
  '製造',
  'AI-SURPLUS-001-A / AI-SURPLUS-001-B',
  100,
  150,
  '2026-09-22'::date,
  '2026-09-21'::date,
  '2026-09-22'::date,
  '製造G',
  now(),
  now()
from posts p
where p.order_no = 'AI-SURPLUS-001';

commit;

select
  p.order_no,
  p.order_amount,
  sum(l.quantity)::integer as manufactured_lot_amount,
  sum(l.quantity)::integer - p.order_amount as surplus_amount,
  count(l.id)::integer as lot_count
from posts p
join lots l on l.post_id = p.id and not l.deleted
where p.order_no = 'AI-SURPLUS-001'
group by p.order_no, p.order_amount;
