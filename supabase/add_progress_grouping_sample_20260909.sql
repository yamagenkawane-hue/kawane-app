-- Progress grouping sample data.
-- This script does not use helper tables. Run the whole script in Supabase SQL Editor.

begin;

set local search_path = public;

delete from shipments
where post_id in (
  select id from posts
  where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
);

delete from inventory_allocations
where post_id in (
  select id from posts
  where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
);

delete from inventory_items
where lot_id in (
  select id from lots
  where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
);

delete from process_transfer_history
where post_id in (
  select id from posts
  where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
);

delete from lot_process_balance
where post_id in (
  select id from posts
  where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
);

delete from production_results
where post_id in (
  select id from posts
  where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
);

delete from lots
where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003');

delete from production_schedules
where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003');

delete from order_processes
where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003');

delete from posts
where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003');

insert into customer_master (
  customer_name,
  shipping_offset_days,
  note
)
select
  'グループ表示テスト工業',
  2,
  '進捗管理グループ表示検証用'
where not exists (
  select 1
  from customer_master
  where customer_name = 'グループ表示テスト工業'
);

insert into product_master (
  product_code,
  product_name,
  customer_name,
  customer_id,
  standard,
  unit,
  unit_weight
)
select
  'GROUP-P001',
  'グループ表示サンプル',
  cm.customer_name,
  cm.id,
  'GROUP-MAT-001',
  '個',
  1.00
from customer_master cm
where cm.customer_name = 'グループ表示テスト工業'
  and not exists (
    select 1
    from product_master pm
    where pm.product_code = 'GROUP-P001'
  );

update product_master pm
set
  product_name = 'グループ表示サンプル',
  customer_name = cm.customer_name,
  customer_id = cm.id,
  standard = 'GROUP-MAT-001',
  unit = '個',
  unit_weight = 1.00
from customer_master cm
where pm.product_code = 'GROUP-P001'
  and cm.customer_name = 'グループ表示テスト工業';

insert into product_processes (
  product_code,
  product_id,
  process_name,
  process_order,
  subcontractor_id,
  overlap_days,
  created_at,
  updated_at
)
select
  pm.product_code,
  pm.id,
  seed.process_name,
  seed.process_order,
  null,
  0,
  now(),
  now()
from product_master pm
cross join (
  values
    (1, '製造'),
    (2, '洗浄'),
    (3, '検査'),
    (4, '計量'),
    (5, '梱包')
) as seed(process_order, process_name)
where pm.product_code = 'GROUP-P001'
  and not exists (
    select 1
    from product_processes pp
    where pp.product_code = pm.product_code
      and pp.process_order = seed.process_order
  );

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
  seed.order_no,
  '',
  pm.product_code,
  pm.product_name,
  pm.id,
  cm.customer_name,
  cm.id,
  seed.order_amount,
  seed.completion_scheduled_date::date,
  seed.delivery_date::date,
  '進捗管理グループ表示検証用',
  '未着手',
  false,
  now(),
  now()
from (
  values
    ('GROUP-ORD-001', 100, '2026-09-08', '2026-09-10'),
    ('GROUP-ORD-002', 500, '2026-09-09', '2026-09-11'),
    ('GROUP-ORD-003', 250, '2026-09-10', '2026-09-12')
) as seed(order_no, order_amount, completion_scheduled_date, delivery_date)
join product_master pm
  on pm.product_code = 'GROUP-P001'
join customer_master cm
  on cm.customer_name = 'グループ表示テスト工業';

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
  0,
  null,
  null,
  pp.id,
  false,
  coalesce(pp.overlap_days, 0),
  now(),
  now()
from posts p
join product_processes pp
  on pp.product_code = p.product_code
where p.order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003');

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
  '',
  '',
  p.order_amount,
  0,
  null,
  p.completion_scheduled_date,
  p.delivery_date,
  '製造G',
  now(),
  now()
from posts p
where p.order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003');

commit;

select
  order_no,
  customer_name,
  product_name,
  order_amount,
  delivery_date
from posts
where order_no in ('GROUP-ORD-001', 'GROUP-ORD-002', 'GROUP-ORD-003')
order by delivery_date, order_no;
