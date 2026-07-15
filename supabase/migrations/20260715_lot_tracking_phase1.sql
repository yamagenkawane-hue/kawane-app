-- Phase 1 for lot tracking.
-- Lots become child rows of posts. Existing lot_no columns remain for
-- compatibility while screens are migrated to lot_id step by step.

alter table lots
  add column if not exists post_id uuid,
  add column if not exists order_no text,
  add column if not exists product_code text,
  add column if not exists material_lot_no text,
  add column if not exists measurement_result_id uuid,
  add column if not exists measurement_order_process_id uuid,
  add column if not exists measured_amount integer not null default 0,
  add column if not exists packaged_amount integer not null default 0,
  add column if not exists inventory_amount integer not null default 0,
  add column if not exists allocated_amount integer not null default 0,
  add column if not exists shipped_amount integer not null default 0,
  add column if not exists measured_at date,
  add column if not exists packaged_at date,
  add column if not exists last_shipped_at date,
  add column if not exists note text;

alter table production_results
  add column if not exists lot_id uuid;

alter table inventory_items
  add column if not exists lot_id uuid;

alter table inventory_allocations
  add column if not exists lot_id uuid;

alter table shipments
  add column if not exists lot_id uuid;

create index if not exists lots_post_id_idx on lots (post_id);
create index if not exists lots_lot_no_idx on lots (lot_no);
create index if not exists production_results_lot_id_idx on production_results (lot_id);
create index if not exists inventory_items_lot_id_idx on inventory_items (lot_id);
create index if not exists inventory_allocations_lot_id_idx on inventory_allocations (lot_id);
create index if not exists shipments_lot_id_idx on shipments (lot_id);

create unique index if not exists lots_post_lot_no_unique_idx
  on lots (post_id, lot_no)
  where post_id is not null and nullif(trim(lot_no), '') is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lots_post_id_fkey') then
    alter table lots
      add constraint lots_post_id_fkey
      foreign key (post_id) references posts(id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lots_measurement_result_id_fkey') then
    alter table lots
      add constraint lots_measurement_result_id_fkey
      foreign key (measurement_result_id) references production_results(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lots_measurement_order_process_id_fkey') then
    alter table lots
      add constraint lots_measurement_order_process_id_fkey
      foreign key (measurement_order_process_id) references order_processes(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'production_results_lot_id_fkey') then
    alter table production_results
      add constraint production_results_lot_id_fkey
      foreign key (lot_id) references lots(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_items_lot_id_fkey') then
    alter table inventory_items
      add constraint inventory_items_lot_id_fkey
      foreign key (lot_id) references lots(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_allocations_lot_id_fkey') then
    alter table inventory_allocations
      add constraint inventory_allocations_lot_id_fkey
      foreign key (lot_id) references lots(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_lot_id_fkey') then
    alter table shipments
      add constraint shipments_lot_id_fkey
      foreign key (lot_id) references lots(id)
      on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lots_amounts_non_negative_chk') then
    alter table lots
      add constraint lots_amounts_non_negative_chk
      check (
        measured_amount >= 0
        and packaged_amount >= 0
        and inventory_amount >= 0
        and allocated_amount >= 0
        and shipped_amount >= 0
      ) not valid;
  end if;
end $$;

update lots l
set post_id = p.id,
    order_no = coalesce(l.order_no, p.order_no),
    product_id = coalesce(l.product_id, p.product_id),
    customer_id = coalesce(l.customer_id, p.customer_id),
    product_code = coalesce(l.product_code, p.product_code),
    product_name = coalesce(nullif(l.product_name, ''), p.product_name),
    customer_name = coalesce(nullif(l.customer_name, ''), p.customer_name),
    measured_amount = case
      when coalesce(l.measured_amount, 0) = 0 then coalesce(l.quantity, 0)
      else l.measured_amount
    end,
    measured_at = coalesce(l.measured_at, l.created_at::date)
from posts p
where l.post_id is null
  and nullif(trim(coalesce(l.lot_no, '')), '') is not null
  and nullif(trim(coalesce(p.lot_no, '')), '') = nullif(trim(coalesce(l.lot_no, '')), '');

insert into lots (
  post_id,
  order_no,
  product_id,
  customer_id,
  product_code,
  product_name,
  customer_name,
  lot_no,
  lot_type,
  quantity,
  measured_amount,
  status,
  measured_at,
  created_at,
  updated_at
)
select
  p.id,
  p.order_no,
  p.product_id,
  p.customer_id,
  p.product_code,
  p.product_name,
  p.customer_name,
  p.lot_no,
  'normal',
  coalesce((
    select sum(pr.amount)::integer
    from production_results pr
    where pr.post_id = p.id
      and coalesce(pr.process_name, '') like '%計量%'
  ), 0),
  coalesce((
    select sum(pr.amount)::integer
    from production_results pr
    where pr.post_id = p.id
      and coalesce(pr.process_name, '') like '%計量%'
  ), 0),
  'measured',
  coalesce((
    select min(pr.date)
    from production_results pr
    where pr.post_id = p.id
      and coalesce(pr.process_name, '') like '%計量%'
  ), current_date),
  now(),
  now()
from posts p
where nullif(trim(coalesce(p.lot_no, '')), '') is not null
  and not exists (
    select 1
    from lots l
    where l.post_id = p.id
      and nullif(trim(coalesce(l.lot_no, '')), '') = nullif(trim(coalesce(p.lot_no, '')), '')
  );

create or replace view v_lot_flow_status as
select
  l.id,
  l.post_id,
  coalesce(p.order_no, l.order_no) as order_no,
  l.product_id,
  coalesce(pm.product_code, l.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, l.product_name, p.product_name) as product_name,
  l.customer_id,
  coalesce(cm.customer_name, l.customer_name, p.customer_name) as customer_name,
  l.lot_no,
  l.material_lot_no,
  l.measurement_result_id,
  l.measurement_order_process_id,
  coalesce(l.measured_amount, 0) as measured_amount,
  coalesce(l.packaged_amount, 0) as packaged_amount,
  coalesce(ii.current_stock_sum, l.inventory_amount, 0) as inventory_amount,
  coalesce(ia.allocated_sum, l.allocated_amount, 0) as allocated_amount,
  coalesce(s.shipped_sum, l.shipped_amount, 0) as shipped_amount,
  greatest(coalesce(l.measured_amount, 0) - coalesce(s.shipped_sum, l.shipped_amount, 0), 0) as remaining_amount,
  case
    when coalesce(l.status, '') = 'cancelled' then 'cancelled'
    when coalesce(s.shipped_sum, l.shipped_amount, 0) >= coalesce(l.measured_amount, 0)
      and coalesce(l.measured_amount, 0) > 0 then 'shipped'
    when coalesce(s.shipped_sum, l.shipped_amount, 0) > 0 then 'partial_shipped'
    when coalesce(ia.allocated_sum, l.allocated_amount, 0) > 0 then 'allocated'
    when coalesce(ii.current_stock_sum, l.inventory_amount, 0) > 0 then 'stocked'
    when coalesce(l.packaged_amount, 0) > 0 then 'packaging'
    else 'measured'
  end as flow_status,
  l.measured_at,
  l.packaged_at,
  l.last_shipped_at,
  l.note,
  l.created_at,
  l.updated_at
from lots l
left join posts p on p.id = l.post_id
left join product_master pm on pm.id = coalesce(l.product_id, p.product_id)
left join customer_master cm on cm.id = coalesce(l.customer_id, p.customer_id)
left join (
  select lot_id, sum(current_stock)::integer as current_stock_sum
  from inventory_items
  where lot_id is not null
  group by lot_id
) ii on ii.lot_id = l.id
left join (
  select lot_id, sum(allocated_amount - shipped_amount)::integer as allocated_sum
  from inventory_allocations
  where lot_id is not null
  group by lot_id
) ia on ia.lot_id = l.id
left join (
  select lot_id, sum(quantity)::integer as shipped_sum
  from shipments
  where lot_id is not null
  group by lot_id
) s on s.lot_id = l.id;
