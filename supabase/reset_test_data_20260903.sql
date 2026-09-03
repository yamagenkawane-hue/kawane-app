-- Test data reset for progress-management verification.
-- This script deletes current operational data and inserts a fresh test set.
-- Master data is not deleted. Required demo master rows are created only when missing.

begin;

create temp table tmp_seed_products (
  product_code text primary key,
  product_name text not null,
  customer_name text not null,
  material_code text not null,
  unit_weight numeric not null
) on commit drop;

insert into tmp_seed_products (
  product_code,
  product_name,
  customer_name,
  material_code,
  unit_weight
) values
  ('TEST-P101', 'テスト製品01', 'テスト工業', 'MAT-TEST-A', 1.20),
  ('TEST-P102', 'テスト製品02', 'テスト工業', 'MAT-TEST-A', 1.35),
  ('TEST-P103', 'テスト製品03', 'テスト工業', 'MAT-TEST-B', 1.50),
  ('TEST-P104', 'テスト製品04', 'テスト工業', 'MAT-TEST-B', 1.80),
  ('TEST-P105', 'テスト製品05', 'テスト工業', 'MAT-TEST-C', 2.00);

create temp table tmp_process_templates (
  process_order integer primary key,
  process_name text not null,
  is_outsource boolean not null default false,
  overlap_days integer not null default 0
) on commit drop;

insert into tmp_process_templates (
  process_order,
  process_name,
  is_outsource,
  overlap_days
) values
  (1, '製造', false, 0),
  (2, 'メッキ', true, 0),
  (3, '検査', false, 1),
  (4, '計量', false, 1),
  (5, '梱包', false, 0);

-- Delete operational data only. Master tables are intentionally kept.
delete from shipments;
delete from inventory_allocations;
delete from inventory_items;
delete from process_transfer_history;
delete from lot_process_balance;
delete from production_results;
delete from lots;
delete from production_schedules;
delete from order_processes;
delete from posts;

insert into customer_master (
  customer_name,
  shipping_offset_days,
  note
)
select
  'テスト工業',
  2,
  'テストデータ用'
where not exists (
  select 1
  from customer_master
  where customer_name = 'テスト工業'
);

insert into material_master (
  material_code,
  material_number,
  material_name,
  size,
  remaining_amount
)
select *
from (
  values
    ('MAT-TEST-A', 'ZAI-TEST-01', 'テスト材料A', 't1.0 x 100', 2400),
    ('MAT-TEST-B', 'ZAI-TEST-02', 'テスト材料B', 't1.5 x 150', 3600),
    ('MAT-TEST-C', 'ZAI-TEST-03', 'テスト材料C', 't2.0 x 200', 1800)
) as seed(material_code, material_number, material_name, size, remaining_amount)
where not exists (
  select 1
  from material_master mm
  where mm.material_code = seed.material_code
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
  p.product_code,
  p.product_name,
  p.customer_name,
  cm.id,
  p.material_code,
  '個',
  p.unit_weight
from tmp_seed_products p
join customer_master cm
  on cm.customer_name = p.customer_name
where not exists (
  select 1
  from product_master pm
  where pm.product_code = p.product_code
);

update product_master pm
set product_name = p.product_name,
    customer_name = p.customer_name,
    customer_id = cm.id,
    standard = p.material_code,
    unit = '個',
    unit_weight = p.unit_weight
from tmp_seed_products p
join customer_master cm
  on cm.customer_name = p.customer_name
where pm.product_code = p.product_code;

insert into subcontractors (
  name,
  process_name
)
select
  'テストメッキ外注',
  'メッキ'
where not exists (
  select 1
  from subcontractors
  where name = 'テストメッキ外注'
);

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
  pt.process_name,
  pt.process_order,
  case when pt.is_outsource then sc.id else null end,
  pt.overlap_days,
  now(),
  now()
from product_master pm
join tmp_seed_products sp
  on sp.product_code = pm.product_code
cross join tmp_process_templates pt
left join subcontractors sc
  on sc.name = 'テストメッキ外注'
where not exists (
  select 1
  from product_processes pp
  where pp.product_code = pm.product_code
    and pp.process_order = pt.process_order
);

create temp table tmp_seed_posts (
  post_id uuid primary key,
  order_no text not null,
  product_code text not null,
  order_amount integer not null,
  completion_scheduled_date date not null,
  delivery_date date not null,
  remark text not null
) on commit drop;

insert into tmp_seed_posts (
  post_id,
  order_no,
  product_code,
  order_amount,
  completion_scheduled_date,
  delivery_date,
  remark
) values
  (gen_random_uuid(), 'TEST-ORD-001', 'TEST-P101', 300, '2026-09-08', '2026-09-10', '未着手の確認用'),
  (gen_random_uuid(), 'TEST-ORD-002', 'TEST-P102', 450, '2026-09-09', '2026-09-11', '製造実績が複数日の確認用'),
  (gen_random_uuid(), 'TEST-ORD-003', 'TEST-P103', 500, '2026-09-10', '2026-09-14', '洗浄から検査へ複数日移動の確認用'),
  (gen_random_uuid(), 'TEST-ORD-004', 'TEST-P104', 600, '2026-09-11', '2026-09-15', '梱包工程到達の確認用'),
  (gen_random_uuid(), 'TEST-ORD-005', 'TEST-P105', 350, '2026-09-12', '2026-09-16', '完了・在庫反映の確認用');

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
  sp.post_id,
  sp.order_no,
  '',
  pm.product_code,
  pm.product_name,
  pm.id,
  cm.customer_name,
  cm.id,
  sp.order_amount,
  sp.completion_scheduled_date,
  sp.delivery_date,
  sp.remark,
  '未着手',
  false,
  now(),
  now()
from tmp_seed_posts sp
join product_master pm
  on pm.product_code = sp.product_code
join customer_master cm
  on cm.customer_name = 'テスト工業';

create temp table tmp_process_completed (
  order_no text not null,
  process_order integer not null,
  completed_amount integer not null,
  completed_date date
) on commit drop;

insert into tmp_process_completed (
  order_no,
  process_order,
  completed_amount,
  completed_date
) values
  ('TEST-ORD-002', 1, 350, '2026-09-02'),
  ('TEST-ORD-003', 1, 500, '2026-09-02'),
  ('TEST-ORD-003', 2, 500, '2026-09-04'),
  ('TEST-ORD-004', 1, 600, '2026-09-02'),
  ('TEST-ORD-004', 2, 600, '2026-09-04'),
  ('TEST-ORD-004', 3, 600, '2026-09-05'),
  ('TEST-ORD-004', 4, 600, '2026-09-06'),
  ('TEST-ORD-005', 1, 350, '2026-09-01'),
  ('TEST-ORD-005', 2, 350, '2026-09-02'),
  ('TEST-ORD-005', 3, 350, '2026-09-03'),
  ('TEST-ORD-005', 4, 350, '2026-09-04'),
  ('TEST-ORD-005', 5, 350, '2026-09-05');

create temp table tmp_order_processes (
  order_process_id uuid primary key,
  post_id uuid not null,
  order_no text not null,
  product_code text not null,
  process_order integer not null,
  process_name text not null
) on commit drop;

insert into tmp_order_processes (
  order_process_id,
  post_id,
  order_no,
  product_code,
  process_order,
  process_name
)
select
  gen_random_uuid(),
  sp.post_id,
  sp.order_no,
  pm.product_code,
  pt.process_order,
  pt.process_name
from tmp_seed_posts sp
join product_master pm
  on pm.product_code = sp.product_code
cross join tmp_process_templates pt;

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
  op.order_process_id,
  op.post_id,
  op.order_no,
  pm.product_code,
  pm.product_name,
  pm.id,
  cm.customer_name,
  cm.id,
  op.process_name,
  op.process_order,
  sp.order_amount,
  coalesce(pc.completed_amount, 0),
  pc.completed_date,
  case when pt.is_outsource then sc.id else null end,
  pp.id,
  false,
  pt.overlap_days,
  now(),
  now()
from tmp_order_processes op
join tmp_seed_posts sp
  on sp.post_id = op.post_id
join product_master pm
  on pm.product_code = op.product_code
join customer_master cm
  on cm.customer_name = 'テスト工業'
join tmp_process_templates pt
  on pt.process_order = op.process_order
left join tmp_process_completed pc
  on pc.order_no = op.order_no
 and pc.process_order = op.process_order
left join subcontractors sc
  on sc.name = 'テストメッキ外注'
left join lateral (
  select id
  from product_processes pp
  where pp.product_code = op.product_code
    and pp.process_order = op.process_order
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1
) pp on true;

create temp table tmp_seed_lots (
  lot_id uuid primary key,
  order_no text not null,
  lot_no text not null,
  material_lot_no text,
  quantity integer not null,
  manufacturing_date date not null,
  current_process_order integer,
  current_quantity integer not null default 0,
  inventory_quantity integer not null default 0,
  lot_status text not null
) on commit drop;

insert into tmp_seed_lots (
  lot_id,
  order_no,
  lot_no,
  material_lot_no,
  quantity,
  manufacturing_date,
  current_process_order,
  current_quantity,
  inventory_quantity,
  lot_status
) values
  (gen_random_uuid(), 'TEST-ORD-002', '20260901-A', 'M-TEST-01', 200, '2026-09-01', 2, 200, 0, 'in_process'),
  (gen_random_uuid(), 'TEST-ORD-002', '20260902-A', 'M-TEST-02', 150, '2026-09-02', 2, 150, 0, 'in_process'),
  (gen_random_uuid(), 'TEST-ORD-003', '20260901-B', 'M-TEST-03', 250, '2026-09-01', 3, 250, 0, 'in_process'),
  (gen_random_uuid(), 'TEST-ORD-003', '20260902-B', 'M-TEST-04', 250, '2026-09-02', 3, 250, 0, 'in_process'),
  (gen_random_uuid(), 'TEST-ORD-004', '20260901-C', 'M-TEST-05', 300, '2026-09-01', 5, 300, 0, 'in_process'),
  (gen_random_uuid(), 'TEST-ORD-004', '20260902-C', 'M-TEST-06', 300, '2026-09-02', 5, 300, 0, 'in_process'),
  (gen_random_uuid(), 'TEST-ORD-005', '20260901-D', 'M-TEST-07', 350, '2026-09-01', null, 0, 350, 'stocked');

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
  sl.lot_id,
  sp.post_id,
  sp.order_no,
  pm.id,
  cm.id,
  pm.product_code,
  pm.product_name,
  cm.customer_name,
  sl.lot_no,
  sl.material_lot_no,
  'normal',
  sl.quantity,
  sl.quantity,
  case when sl.lot_status = 'stocked' then sl.quantity else 0 end,
  sl.inventory_quantity,
  sl.lot_status,
  sl.manufacturing_date,
  case when sl.lot_status = 'stocked' then '2026-09-05'::date else null end,
  false,
  now(),
  now()
from tmp_seed_lots sl
join tmp_seed_posts sp
  on sp.order_no = sl.order_no
join product_master pm
  on pm.product_code = sp.product_code
join customer_master cm
  on cm.customer_name = 'テスト工業';

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
  sp.post_id,
  op.order_process_id,
  sl.lot_id,
  op.order_process_id::text,
  '製造',
  sl.manufacturing_date,
  sl.quantity,
  sl.manufacturing_date::timestamptz
from tmp_seed_lots sl
join tmp_seed_posts sp
  on sp.order_no = sl.order_no
join tmp_order_processes op
  on op.order_no = sl.order_no
 and op.process_order = 1;

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
  sp.post_id,
  op.order_process_id,
  sl.lot_id,
  op.process_name,
  op.process_order,
  sl.current_quantity,
  now(),
  now()
from tmp_seed_lots sl
join tmp_seed_posts sp
  on sp.order_no = sl.order_no
join tmp_order_processes op
  on op.order_no = sl.order_no
 and op.process_order = sl.current_process_order
where sl.current_process_order is not null
  and sl.current_quantity > 0;

insert into process_transfer_history (
  post_id,
  lot_id,
  from_order_process_id,
  to_order_process_id,
  from_process_name,
  to_process_name,
  from_process_order,
  to_process_order,
  quantity,
  movement_type,
  before_to_quantity,
  after_to_quantity,
  reason,
  idempotency_key,
  created_at
)
select
  sp.post_id,
  sl.lot_id,
  null,
  op_to.order_process_id,
  null,
  op_to.process_name,
  null,
  op_to.process_order,
  sl.quantity,
  'manufacturing_result',
  0,
  sl.quantity,
  'Seed manufacturing result',
  'seed-manufacturing-' || sp.order_no || '-' || sl.lot_no,
  sl.manufacturing_date::timestamptz
from tmp_seed_lots sl
join tmp_seed_posts sp
  on sp.order_no = sl.order_no
join tmp_order_processes op_to
  on op_to.order_no = sl.order_no
 and op_to.process_order = 2;

create temp table tmp_seed_transfers (
  order_no text not null,
  lot_no text not null,
  from_process_order integer not null,
  to_process_order integer,
  quantity integer not null,
  movement_type text not null,
  moved_at date not null
) on commit drop;

insert into tmp_seed_transfers (
  order_no,
  lot_no,
  from_process_order,
  to_process_order,
  quantity,
  movement_type,
  moved_at
) values
  ('TEST-ORD-003', '20260901-B', 2, 3, 250, 'process_transfer', '2026-09-03'),
  ('TEST-ORD-003', '20260902-B', 2, 3, 250, 'process_transfer', '2026-09-04'),
  ('TEST-ORD-004', '20260901-C', 2, 3, 300, 'process_transfer', '2026-09-03'),
  ('TEST-ORD-004', '20260901-C', 3, 4, 300, 'process_transfer', '2026-09-04'),
  ('TEST-ORD-004', '20260901-C', 4, 5, 300, 'process_transfer', '2026-09-05'),
  ('TEST-ORD-004', '20260902-C', 2, 3, 300, 'process_transfer', '2026-09-04'),
  ('TEST-ORD-004', '20260902-C', 3, 4, 300, 'process_transfer', '2026-09-05'),
  ('TEST-ORD-004', '20260902-C', 4, 5, 300, 'process_transfer', '2026-09-06'),
  ('TEST-ORD-005', '20260901-D', 2, 3, 350, 'process_transfer', '2026-09-02'),
  ('TEST-ORD-005', '20260901-D', 3, 4, 350, 'process_transfer', '2026-09-03'),
  ('TEST-ORD-005', '20260901-D', 4, 5, 350, 'process_transfer', '2026-09-04'),
  ('TEST-ORD-005', '20260901-D', 5, null, 350, 'stock_in', '2026-09-05');

insert into process_transfer_history (
  post_id,
  lot_id,
  from_order_process_id,
  to_order_process_id,
  from_process_name,
  to_process_name,
  from_process_order,
  to_process_order,
  quantity,
  movement_type,
  before_from_quantity,
  after_from_quantity,
  before_to_quantity,
  after_to_quantity,
  reason,
  idempotency_key,
  created_at
)
select
  sp.post_id,
  sl.lot_id,
  op_from.order_process_id,
  op_to.order_process_id,
  op_from.process_name,
  op_to.process_name,
  op_from.process_order,
  op_to.process_order,
  st.quantity,
  st.movement_type,
  st.quantity,
  0,
  0,
  st.quantity,
  'Seed process movement',
  'seed-transfer-' || st.order_no || '-' || st.lot_no || '-' || st.from_process_order,
  st.moved_at::timestamptz
from tmp_seed_transfers st
join tmp_seed_posts sp
  on sp.order_no = st.order_no
join tmp_seed_lots sl
  on sl.order_no = st.order_no
 and sl.lot_no = st.lot_no
join tmp_order_processes op_from
  on op_from.order_no = st.order_no
 and op_from.process_order = st.from_process_order
left join tmp_order_processes op_to
  on op_to.order_no = st.order_no
 and op_to.process_order = st.to_process_order;

insert into inventory_items (
  lot_id,
  product_id,
  product_code,
  product_name,
  lot_no,
  current_stock,
  allocated_stock,
  updated_at
)
select
  sl.lot_id,
  pm.id,
  pm.product_code,
  pm.product_name,
  sl.lot_no,
  sl.inventory_quantity,
  0,
  now()
from tmp_seed_lots sl
join tmp_seed_posts sp
  on sp.order_no = sl.order_no
join product_master pm
  on pm.product_code = sp.product_code
where sl.inventory_quantity > 0;

insert into inventory_items (
  product_id,
  product_code,
  product_name,
  lot_no,
  current_stock,
  allocated_stock,
  updated_at
)
select
  pm.id,
  pm.product_code,
  pm.product_name,
  'INV-TEST-001',
  120,
  40,
  now()
from product_master pm
where pm.product_code = 'TEST-P101';

insert into inventory_allocations (
  post_id,
  inventory_item_id,
  product_id,
  product_code,
  lot_no,
  allocated_amount,
  shipped_amount,
  confirmed_at
)
select
  sp.post_id,
  ii.id,
  pm.id,
  pm.product_code,
  ii.lot_no,
  40,
  0,
  now()
from tmp_seed_posts sp
join product_master pm
  on pm.product_code = sp.product_code
join inventory_items ii
  on ii.product_code = pm.product_code
 and ii.lot_no = 'INV-TEST-001'
where sp.order_no = 'TEST-ORD-001';

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
  sp.post_id,
  sp.order_no,
  pm.id,
  cm.id,
  cm.customer_name,
  pm.product_name,
  case
    when dept.department = '製造G' then '製造'
    when dept.department = '品質管理G' then '検査'
    else '梱包'
  end,
  coalesce(lot_summary.lot_list, ''),
  sp.order_amount,
  coalesce(done.completed_amount, 0),
  done.completed_date,
  case
    when dept.department = '製造G' then sp.completion_scheduled_date - 4
    when dept.department = '品質管理G' then sp.completion_scheduled_date - 2
    else sp.completion_scheduled_date
  end,
  case
    when dept.department = '製造G' then sp.completion_scheduled_date - 3
    when dept.department = '品質管理G' then sp.completion_scheduled_date - 1
    else sp.delivery_date
  end,
  dept.department,
  now(),
  now()
from tmp_seed_posts sp
join product_master pm
  on pm.product_code = sp.product_code
join customer_master cm
  on cm.customer_name = 'テスト工業'
cross join (
  values ('製造G'), ('品質管理G'), ('梱包出荷G')
) as dept(department)
left join lateral (
  select string_agg(lot_no, ' / ' order by lot_no) as lot_list
  from tmp_seed_lots sl
  where sl.order_no = sp.order_no
) lot_summary on true
left join lateral (
  select
    pc.completed_amount,
    pc.completed_date
  from tmp_process_completed pc
  where pc.order_no = sp.order_no
    and pc.process_order = case
      when dept.department = '製造G' then 1
      when dept.department = '品質管理G' then 3
      else 5
    end
  limit 1
) done on true;

commit;

select 'posts' as table_name, count(*) as row_count from posts
union all
select 'production_schedules', count(*) from production_schedules
union all
select 'order_processes', count(*) from order_processes
union all
select 'lots', count(*) from lots
union all
select 'lot_process_balance', count(*) from lot_process_balance
union all
select 'production_results', count(*) from production_results
union all
select 'process_transfer_history', count(*) from process_transfer_history
union all
select 'inventory_items', count(*) from inventory_items
union all
select 'inventory_allocations', count(*) from inventory_allocations
union all
select 'shipments', count(*) from shipments
order by table_name;
