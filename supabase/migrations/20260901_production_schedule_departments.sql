-- Add department classification to production schedules.
-- Existing rows are treated as Manufacturing Group schedules.

alter table if exists production_schedules
  add column if not exists department text;

update production_schedules
set department = '製造G'
where department is null
   or btrim(department) = '';

alter table if exists production_schedules
  alter column department set default '製造G';

alter table if exists production_schedules
  alter column department set not null;

alter table if exists production_schedules
  drop constraint if exists production_schedules_department_chk;

alter table if exists production_schedules
  add constraint production_schedules_department_chk
  check (department in ('製造G', '品質管理G', '梱包出荷G'));

create index if not exists production_schedules_department_idx
  on production_schedules (department);

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
  ps.updated_at,
  ps.department
from production_schedules ps
left join posts p
  on p.id = ps.post_id
left join product_master pm
  on pm.id = ps.product_id
left join customer_master cm
  on cm.id = ps.customer_id;
