-- Add a standard production plan amount to product master.

alter table public.product_master
  add column if not exists plan_amount integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_master_plan_amount_non_negative_chk'
  ) then
    alter table public.product_master
      add constraint product_master_plan_amount_non_negative_chk
      check (plan_amount >= 0) not valid;
  end if;
end $$;

create or replace view public.v_product_master_with_customer as
select
  pm.id,
  pm.product_code,
  pm.product_name,
  pm.standard,
  pm.unit,
  pm.customer_id,
  coalesce(cm.customer_name, pm.customer_name) as customer_name,
  pm.created_at,
  pm.updated_at,
  pm.unit_weight,
  pm.plan_amount
from public.product_master pm
left join public.customer_master cm
  on cm.id = pm.customer_id;

create or replace view public.v_product_material_master as
select
  pm.id as product_id,
  pm.product_code,
  pm.product_name,
  pm.customer_name,
  pm.standard as material_code,
  pm.unit,
  mm.id as material_id,
  mm.material_number,
  mm.material_name,
  mm.size as material_size,
  mm.remaining_amount,
  pm.unit_weight,
  case
    when coalesce(pm.unit_weight, 0) <= 0 then null
    else floor(coalesce(mm.remaining_amount, 0) / pm.unit_weight)
  end as producible_quantity,
  pm.plan_amount
from public.product_master pm
left join public.material_master mm
  on mm.material_code = pm.standard;

create or replace view public.v_production_schedules_with_master as
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
  ps.department,
  coalesce(pm.plan_amount, 0) as product_plan_amount
from public.production_schedules ps
left join public.posts p
  on p.id = ps.post_id
left join public.product_master pm
  on pm.id = coalesce(ps.product_id, p.product_id)
left join public.customer_master cm
  on cm.id = coalesce(ps.customer_id, p.customer_id);
