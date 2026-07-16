-- Add material number and prepare product-material lookup for Gantt views.

alter table public.material_master
  add column if not exists size text,
  add column if not exists remaining_amount numeric not null default 0,
  add column if not exists material_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_master_remaining_amount_non_negative'
  ) then
    alter table public.material_master
      add constraint material_master_remaining_amount_non_negative
      check (remaining_amount >= 0);
  end if;
end $$;

create index if not exists material_master_material_code_idx
  on public.material_master (material_code);

create index if not exists product_master_standard_idx
  on public.product_master (standard);

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
  mm.remaining_amount
from public.product_master pm
left join public.material_master mm
  on mm.material_code = pm.standard;
