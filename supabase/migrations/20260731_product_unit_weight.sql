-- Add product unit weight for weight-based measurement registration.
-- "unit" is kept for backward compatibility, but the UI now uses unit_weight.

alter table public.product_master
  add column if not exists unit_weight numeric not null default 0;

alter table public.lots
  add column if not exists measured_weight numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_master_unit_weight_non_negative_chk'
  ) then
    alter table public.product_master
      add constraint product_master_unit_weight_non_negative_chk
      check (unit_weight >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lots_measured_weight_non_negative_chk'
  ) then
    alter table public.lots
      add constraint lots_measured_weight_non_negative_chk
      check (measured_weight >= 0) not valid;
  end if;
end $$;

create or replace view public.v_product_master_with_customer as
select
  pm.id,
  pm.product_code,
  pm.product_name,
  pm.standard,
  pm.unit,
  pm.unit_weight,
  pm.customer_id,
  coalesce(cm.customer_name, pm.customer_name) as customer_name,
  pm.created_at,
  pm.updated_at
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
  pm.unit_weight,
  mm.id as material_id,
  mm.material_number,
  mm.material_name,
  mm.size as material_size,
  mm.remaining_amount,
  case
    when coalesce(pm.unit_weight, 0) <= 0 then null
    else floor(coalesce(mm.remaining_amount, 0) / pm.unit_weight)
  end as producible_quantity
from public.product_master pm
left join public.material_master mm
  on mm.material_code = pm.standard;
