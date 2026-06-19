-- Phase 2: read models for id-based joins.
-- These views keep existing tables unchanged and make the next application changes safer.

create or replace view v_product_master_with_customer as
select
  pm.id,
  pm.product_code,
  pm.product_name,
  pm.standard,
  pm.unit,
  pm.customer_id,
  coalesce(cm.customer_name, pm.customer_name) as customer_name,
  pm.created_at,
  pm.updated_at
from product_master pm
left join customer_master cm
  on cm.id = pm.customer_id;

create or replace view v_product_processes_with_master as
select
  pp.id,
  pp.product_id,
  coalesce(pm.product_code, pp.product_code) as product_code,
  pm.product_name,
  pm.customer_id,
  cm.customer_name,
  pp.process_master_id,
  coalesce(pr.process_id, pp.process_name) as process_id,
  coalesce(pr.name, pp.process_name) as process_name,
  pp.process_order,
  pr.days,
  coalesce(pr.enabled, true) as enabled,
  coalesce(pr.outsourcing, false) as outsourcing,
  pp.subcontractor_id,
  sc.name as subcontractor_name,
  pp.created_at,
  pp.updated_at
from product_processes pp
left join product_master pm
  on pm.id = pp.product_id
left join customer_master cm
  on cm.id = pm.customer_id
left join process_master pr
  on pr.id = pp.process_master_id
left join subcontractors sc
  on sc.id = pp.subcontractor_id;

create or replace view v_order_processes_with_master as
select
  op.id,
  op.post_id,
  p.order_no,
  op.product_id,
  coalesce(pm.product_code, op.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, op.product_name, p.product_name) as product_name,
  op.customer_id,
  coalesce(cm.customer_name, op.customer_name, p.customer_name) as customer_name,
  op.product_process_id,
  op.process_name,
  op.process_order,
  op.planned_amount,
  op.completed_amount,
  greatest(op.planned_amount - op.completed_amount, 0) as remaining_amount,
  case
    when op.planned_amount <= 0 then 0
    else round((op.completed_amount::numeric / op.planned_amount::numeric) * 100, 1)
  end as progress_rate,
  op.completed_date,
  op.subcontractor_id,
  sc.name as subcontractor_name,
  op.locked,
  p.delivery_date,
  p.completion_scheduled_date,
  op.created_at,
  op.updated_at
from order_processes op
left join posts p
  on p.id = op.post_id
left join product_master pm
  on pm.id = op.product_id
left join customer_master cm
  on cm.id = op.customer_id
left join subcontractors sc
  on sc.id = op.subcontractor_id;

create or replace view v_production_results_with_master as
select
  prr.id,
  prr.post_id,
  p.order_no,
  prr.schedule_id,
  prr.order_process_id,
  op.process_order,
  coalesce(op.process_name, prr.process_name) as process_name,
  op.product_id,
  coalesce(pm.product_code, op.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, op.product_name, p.product_name) as product_name,
  op.customer_id,
  coalesce(cm.customer_name, op.customer_name, p.customer_name) as customer_name,
  prr.date,
  prr.amount,
  prr.created_at
from production_results prr
left join posts p
  on p.id = prr.post_id
left join order_processes op
  on op.id = prr.order_process_id
left join product_master pm
  on pm.id = coalesce(op.product_id, p.product_id)
left join customer_master cm
  on cm.id = coalesce(op.customer_id, p.customer_id);

create or replace view v_production_schedules_with_master as
select
  ps.id,
  ps.post_id,
  coalesce(p.order_no, ps.order_no) as order_no,
  ps.product_id,
  coalesce(pm.product_code, p.product_code, ps.press_number) as product_code,
  coalesce(pm.product_name, ps.product_name, p.product_name) as product_name,
  ps.customer_id,
  coalesce(cm.customer_name, ps.customer_name, p.customer_name) as customer_name,
  ps.press_number,
  ps.lot_no,
  ps.plan_amount,
  ps.press_completed_amount,
  greatest(ps.plan_amount - ps.press_completed_amount, 0) as remaining_amount,
  ps.press_completed_date,
  ps.shipping_scheduled_start,
  ps.shipping_scheduled_end,
  coalesce(p.delivery_date, ps.shipping_scheduled_end) as delivery_date,
  ps.created_at,
  ps.updated_at
from production_schedules ps
left join posts p
  on p.id = ps.post_id
left join product_master pm
  on pm.id = ps.product_id
left join customer_master cm
  on cm.id = ps.customer_id;

create or replace view v_inventory_items_with_master as
select
  ii.id,
  ii.product_id,
  coalesce(pm.product_code, ii.product_code) as product_code,
  coalesce(pm.product_name, ii.product_name) as product_name,
  pm.customer_id,
  cm.customer_name,
  ii.lot_no,
  ii.current_stock,
  ii.allocated_stock,
  greatest(ii.current_stock - ii.allocated_stock, 0) as available_stock,
  ii.updated_at
from inventory_items ii
left join product_master pm
  on pm.id = ii.product_id
left join customer_master cm
  on cm.id = pm.customer_id;

create or replace view v_inventory_allocations_with_master as
select
  ia.id,
  ia.post_id,
  p.order_no,
  ia.inventory_item_id,
  ia.product_id,
  coalesce(pm.product_code, ia.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, p.product_name) as product_name,
  p.customer_id,
  cm.customer_name,
  ia.lot_no,
  ia.allocated_amount,
  ia.shipped_amount,
  greatest(ia.allocated_amount - ia.shipped_amount, 0) as unshipped_amount,
  ia.confirmed_at
from inventory_allocations ia
left join posts p
  on p.id = ia.post_id
left join product_master pm
  on pm.id = ia.product_id
left join customer_master cm
  on cm.id = p.customer_id;

create or replace view v_shipments_with_master as
select
  s.id,
  s.post_id,
  coalesce(p.order_no, s.order_no) as order_no,
  s.product_id,
  coalesce(pm.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, s.product_name, p.product_name) as product_name,
  s.customer_id,
  coalesce(cm.customer_name, s.customer_name, p.customer_name) as customer_name,
  s.lot_no,
  s.scheduled_date,
  s.delivery_date,
  s.order_amount,
  s.quantity,
  s.created_at,
  s.updated_at
from shipments s
left join posts p
  on p.id = s.post_id
left join product_master pm
  on pm.id = s.product_id
left join customer_master cm
  on cm.id = s.customer_id;

create or replace view v_post_process_progress as
select
  p.id as post_id,
  p.order_no,
  p.product_id,
  coalesce(pm.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, p.product_name) as product_name,
  p.customer_id,
  coalesce(cm.customer_name, p.customer_name) as customer_name,
  p.order_amount,
  p.delivery_date,
  count(op.id) as process_count,
  count(op.id) filter (where op.completed_amount >= op.planned_amount and op.planned_amount > 0) as completed_process_count,
  coalesce(sum(op.planned_amount), 0) as total_planned_amount,
  coalesce(sum(op.completed_amount), 0) as total_completed_amount,
  min(op.process_order) filter (where op.completed_amount < op.planned_amount) as current_process_order,
  max(op.completed_date) as latest_completed_date
from posts p
left join product_master pm
  on pm.id = p.product_id
left join customer_master cm
  on cm.id = p.customer_id
left join order_processes op
  on op.post_id = p.id
group by
  p.id,
  p.order_no,
  p.product_id,
  pm.product_code,
  pm.product_name,
  p.product_code,
  p.product_name,
  p.customer_id,
  cm.customer_name,
  p.customer_name,
  p.order_amount,
  p.delivery_date;
