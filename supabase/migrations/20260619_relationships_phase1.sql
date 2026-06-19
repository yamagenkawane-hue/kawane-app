-- Phase 1: add id-based relationships without removing existing text columns.
-- Run this in Supabase SQL Editor before changing the application to rely on joins.

alter table product_master
  add column if not exists customer_id uuid;

alter table posts
  add column if not exists product_id uuid,
  add column if not exists customer_id uuid;

alter table product_processes
  add column if not exists product_id uuid,
  add column if not exists process_master_id uuid;

alter table order_processes
  add column if not exists product_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists product_process_id uuid;

alter table production_schedules
  add column if not exists post_id uuid,
  add column if not exists product_id uuid,
  add column if not exists customer_id uuid;

alter table inventory_items
  add column if not exists product_id uuid;

alter table lots
  add column if not exists product_id uuid,
  add column if not exists customer_id uuid;

alter table shipments
  add column if not exists product_id uuid,
  add column if not exists customer_id uuid;

alter table inventory_allocations
  add column if not exists product_id uuid;

create index if not exists product_master_customer_id_idx
  on product_master (customer_id);

create index if not exists posts_product_id_idx
  on posts (product_id);

create index if not exists posts_customer_id_idx
  on posts (customer_id);

create index if not exists product_processes_product_id_idx
  on product_processes (product_id);

create index if not exists product_processes_process_master_id_idx
  on product_processes (process_master_id);

create index if not exists order_processes_product_process_id_idx
  on order_processes (product_process_id);

create index if not exists production_schedules_post_id_idx
  on production_schedules (post_id);

create index if not exists inventory_items_product_id_idx
  on inventory_items (product_id);

update product_master pm
set customer_id = cm.id
from customer_master cm
where pm.customer_id is null
  and pm.customer_name is not null
  and pm.customer_name = cm.customer_name;

update posts p
set product_id = pm.id
from product_master pm
where p.product_id is null
  and p.product_code is not null
  and p.product_code = pm.product_code;

update posts p
set product_id = pm.id
from product_master pm
where p.product_id is null
  and p.product_name is not null
  and p.customer_name is not null
  and p.product_name = pm.product_name
  and p.customer_name = pm.customer_name;

update posts p
set customer_id = cm.id
from customer_master cm
where p.customer_id is null
  and p.customer_name is not null
  and p.customer_name = cm.customer_name;

update product_processes pp
set product_id = pm.id
from product_master pm
where pp.product_id is null
  and pp.product_code = pm.product_code;

update product_processes pp
set process_master_id = pr.id
from process_master pr
where pp.process_master_id is null
  and (
    pp.process_name = pr.name
    or pp.process_name = pr.process_id
  );

update order_processes op
set product_id = pm.id
from product_master pm
where op.product_id is null
  and op.product_code = pm.product_code;

update order_processes op
set customer_id = cm.id
from customer_master cm
where op.customer_id is null
  and op.customer_name = cm.customer_name;

update order_processes op
set product_process_id = pp.id
from product_processes pp
where op.product_process_id is null
  and (
    op.product_id = pp.product_id
    or op.product_code = pp.product_code
  )
  and op.process_order = pp.process_order
  and op.process_name = pp.process_name;

update production_schedules ps
set post_id = p.id
from posts p
where ps.post_id is null
  and ps.order_no is not null
  and ps.order_no = p.order_no;

update production_schedules ps
set product_id = coalesce(
      (select p.product_id from posts p where p.id = ps.post_id limit 1),
      (
        select pm.id
        from product_master pm
        where pm.product_name = ps.product_name
        limit 1
      )
    ),
    customer_id = coalesce(
      (select p.customer_id from posts p where p.id = ps.post_id limit 1),
      (
        select cm.id
        from customer_master cm
        where cm.customer_name = ps.customer_name
        limit 1
      )
    )
where ps.post_id is not null
  and (ps.product_id is null or ps.customer_id is null);

update production_schedules ps
set product_id = pm.id
from product_master pm
where ps.product_id is null
  and ps.product_name = pm.product_name
  and (
    ps.customer_name = pm.customer_name
    or ps.customer_id = pm.customer_id
  );

update production_schedules ps
set customer_id = cm.id
from customer_master cm
where ps.customer_id is null
  and ps.customer_name = cm.customer_name;

update inventory_items ii
set product_id = pm.id
from product_master pm
where ii.product_id is null
  and ii.product_code is not null
  and ii.product_code = pm.product_code;

update inventory_items ii
set product_id = pm.id
from product_master pm
where ii.product_id is null
  and ii.product_name = pm.product_name;

update lots l
set product_id = pm.id
from product_master pm
where l.product_id is null
  and l.product_name = pm.product_name
  and l.customer_name = pm.customer_name;

update lots l
set customer_id = cm.id
from customer_master cm
where l.customer_id is null
  and l.customer_name = cm.customer_name;

update shipments s
set product_id = coalesce(
      (select p.product_id from posts p where p.id = s.post_id limit 1),
      (
        select pm.id
        from product_master pm
        where pm.product_name = s.product_name
        limit 1
      )
    ),
    customer_id = coalesce(
      (select p.customer_id from posts p where p.id = s.post_id limit 1),
      (
        select cm.id
        from customer_master cm
        where cm.customer_name = s.customer_name
        limit 1
      )
    )
where s.post_id is not null
  and (s.product_id is null or s.customer_id is null);

update inventory_allocations ia
set product_id = pm.id
from product_master pm
where ia.product_id is null
  and ia.product_code = pm.product_code;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_master_customer_id_fkey'
  ) then
    alter table product_master
      add constraint product_master_customer_id_fkey
      foreign key (customer_id) references customer_master(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_product_id_fkey'
  ) then
    alter table posts
      add constraint posts_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_customer_id_fkey'
  ) then
    alter table posts
      add constraint posts_customer_id_fkey
      foreign key (customer_id) references customer_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_processes_product_id_fkey'
  ) then
    alter table product_processes
      add constraint product_processes_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_processes_process_master_id_fkey'
  ) then
    alter table product_processes
      add constraint product_processes_process_master_id_fkey
      foreign key (process_master_id) references process_master(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_processes_product_id_fkey'
  ) then
    alter table order_processes
      add constraint order_processes_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_processes_customer_id_fkey'
  ) then
    alter table order_processes
      add constraint order_processes_customer_id_fkey
      foreign key (customer_id) references customer_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_processes_product_process_id_fkey'
  ) then
    alter table order_processes
      add constraint order_processes_product_process_id_fkey
      foreign key (product_process_id) references product_processes(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'production_schedules_post_id_fkey'
  ) then
    alter table production_schedules
      add constraint production_schedules_post_id_fkey
      foreign key (post_id) references posts(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'production_schedules_product_id_fkey'
  ) then
    alter table production_schedules
      add constraint production_schedules_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'production_schedules_customer_id_fkey'
  ) then
    alter table production_schedules
      add constraint production_schedules_customer_id_fkey
      foreign key (customer_id) references customer_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'production_results_schedule_id_fkey'
  ) then
    alter table production_results
      add constraint production_results_schedule_id_fkey
      foreign key (schedule_id) references production_schedules(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'production_results_post_id_fkey'
  ) then
    alter table production_results
      add constraint production_results_post_id_fkey
      foreign key (post_id) references posts(id)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_items_product_id_fkey'
  ) then
    alter table inventory_items
      add constraint inventory_items_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lots_product_id_fkey'
  ) then
    alter table lots
      add constraint lots_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lots_customer_id_fkey'
  ) then
    alter table lots
      add constraint lots_customer_id_fkey
      foreign key (customer_id) references customer_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_product_id_fkey'
  ) then
    alter table shipments
      add constraint shipments_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_customer_id_fkey'
  ) then
    alter table shipments
      add constraint shipments_customer_id_fkey
      foreign key (customer_id) references customer_master(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_allocations_product_id_fkey'
  ) then
    alter table inventory_allocations
      add constraint inventory_allocations_product_id_fkey
      foreign key (product_id) references product_master(id)
      on delete restrict not valid;
  end if;
end $$;

create or replace view v_posts_with_master as
select
  p.*,
  pm.product_code as master_product_code,
  pm.product_name as master_product_name,
  pm.standard as master_standard,
  pm.unit as master_unit,
  cm.customer_name as master_customer_name,
  cm.shipping_offset_days as master_shipping_offset_days
from posts p
left join product_master pm
  on pm.id = p.product_id
left join customer_master cm
  on cm.id = p.customer_id;

create or replace function sync_product_master_refs()
returns trigger as $$
begin
  if new.customer_id is null and new.customer_name is not null then
    select id
    into new.customer_id
    from customer_master
    where customer_name = new.customer_name
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_product_master_refs on product_master;
create trigger trg_sync_product_master_refs
before insert or update of customer_name, customer_id
on product_master
for each row
execute function sync_product_master_refs();

create or replace function sync_posts_refs()
returns trigger as $$
begin
  if new.product_id is null and new.product_code is not null then
    select id
    into new.product_id
    from product_master
    where product_code = new.product_code
    limit 1;
  end if;

  if new.product_id is null
     and new.product_name is not null
     and new.customer_name is not null then
    select id
    into new.product_id
    from product_master
    where product_name = new.product_name
      and customer_name = new.customer_name
    limit 1;
  end if;

  if new.customer_id is null and new.customer_name is not null then
    select id
    into new.customer_id
    from customer_master
    where customer_name = new.customer_name
    limit 1;
  end if;

  if new.customer_id is null and new.product_id is not null then
    select customer_id
    into new.customer_id
    from product_master
    where id = new.product_id
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_posts_refs on posts;
create trigger trg_sync_posts_refs
before insert or update of product_code, product_name, customer_name, product_id, customer_id
on posts
for each row
execute function sync_posts_refs();

create or replace function sync_product_processes_refs()
returns trigger as $$
begin
  if new.product_id is null and new.product_code is not null then
    select id
    into new.product_id
    from product_master
    where product_code = new.product_code
    limit 1;
  end if;

  if new.process_master_id is null and new.process_name is not null then
    select id
    into new.process_master_id
    from process_master
    where name = new.process_name
       or process_id = new.process_name
    order by sort nulls last
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_product_processes_refs on product_processes;
create trigger trg_sync_product_processes_refs
before insert or update of product_code, process_name, product_id, process_master_id
on product_processes
for each row
execute function sync_product_processes_refs();

create or replace function sync_order_processes_refs()
returns trigger as $$
begin
  if new.product_id is null and new.product_code is not null then
    select id
    into new.product_id
    from product_master
    where product_code = new.product_code
    limit 1;
  end if;

  if new.customer_id is null and new.customer_name is not null then
    select id
    into new.customer_id
    from customer_master
    where customer_name = new.customer_name
    limit 1;
  end if;

  if new.product_process_id is null then
    select id
    into new.product_process_id
    from product_processes
    where (product_id = new.product_id or product_code = new.product_code)
      and process_order = new.process_order
      and process_name = new.process_name
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_order_processes_refs on order_processes;
create trigger trg_sync_order_processes_refs
before insert or update of product_code, customer_name, process_name, process_order, product_id, customer_id, product_process_id
on order_processes
for each row
execute function sync_order_processes_refs();

create or replace function sync_production_schedules_refs()
returns trigger as $$
begin
  if new.post_id is null and new.order_no is not null then
    select id
    into new.post_id
    from posts
    where order_no = new.order_no
    limit 1;
  end if;

  if new.product_id is null and new.post_id is not null then
    select product_id
    into new.product_id
    from posts
    where id = new.post_id
    limit 1;
  end if;

  if new.customer_id is null and new.post_id is not null then
    select customer_id
    into new.customer_id
    from posts
    where id = new.post_id
    limit 1;
  end if;

  if new.product_id is null and new.product_name is not null then
    select id
    into new.product_id
    from product_master
    where product_name = new.product_name
      and (customer_name = new.customer_name or customer_id = new.customer_id)
    limit 1;
  end if;

  if new.customer_id is null and new.customer_name is not null then
    select id
    into new.customer_id
    from customer_master
    where customer_name = new.customer_name
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_production_schedules_refs on production_schedules;
create trigger trg_sync_production_schedules_refs
before insert or update of order_no, product_name, customer_name, post_id, product_id, customer_id
on production_schedules
for each row
execute function sync_production_schedules_refs();

create or replace function sync_inventory_items_refs()
returns trigger as $$
begin
  if new.product_id is null and new.product_code is not null then
    select id
    into new.product_id
    from product_master
    where product_code = new.product_code
    limit 1;
  end if;

  if new.product_id is null and new.product_name is not null then
    select id
    into new.product_id
    from product_master
    where product_name = new.product_name
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_inventory_items_refs on inventory_items;
create trigger trg_sync_inventory_items_refs
before insert or update of product_code, product_name, product_id
on inventory_items
for each row
execute function sync_inventory_items_refs();

create or replace function sync_lots_refs()
returns trigger as $$
begin
  if new.customer_id is null and new.customer_name is not null then
    select id
    into new.customer_id
    from customer_master
    where customer_name = new.customer_name
    limit 1;
  end if;

  if new.product_id is null and new.product_name is not null then
    select id
    into new.product_id
    from product_master
    where product_name = new.product_name
      and (customer_name = new.customer_name or customer_id = new.customer_id)
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_lots_refs on lots;
create trigger trg_sync_lots_refs
before insert or update of product_name, customer_name, product_id, customer_id
on lots
for each row
execute function sync_lots_refs();

create or replace function sync_shipments_refs()
returns trigger as $$
begin
  if new.post_id is not null
     and (new.product_id is null or new.customer_id is null) then
    select coalesce(new.product_id, product_id),
           coalesce(new.customer_id, customer_id)
    into new.product_id, new.customer_id
    from posts
    where id = new.post_id
    limit 1;
  end if;

  if new.customer_id is null and new.customer_name is not null then
    select id
    into new.customer_id
    from customer_master
    where customer_name = new.customer_name
    limit 1;
  end if;

  if new.product_id is null and new.product_name is not null then
    select id
    into new.product_id
    from product_master
    where product_name = new.product_name
      and (customer_id = new.customer_id or customer_name = new.customer_name)
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_shipments_refs on shipments;
create trigger trg_sync_shipments_refs
before insert or update of post_id, product_name, customer_name, product_id, customer_id
on shipments
for each row
execute function sync_shipments_refs();

create or replace function sync_inventory_allocations_refs()
returns trigger as $$
begin
  if new.product_id is null and new.product_code is not null then
    select id
    into new.product_id
    from product_master
    where product_code = new.product_code
    limit 1;
  end if;

  if new.product_id is null and new.post_id is not null then
    select product_id
    into new.product_id
    from posts
    where id = new.post_id
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_inventory_allocations_refs on inventory_allocations;
create trigger trg_sync_inventory_allocations_refs
before insert or update of product_code, post_id, product_id
on inventory_allocations
for each row
execute function sync_inventory_allocations_refs();

create or replace function create_order_processes_for_post(p_post_id uuid)
returns void as $$
begin
  insert into order_processes (
    post_id,
    order_no,
    product_id,
    customer_id,
    product_process_id,
    product_code,
    product_name,
    customer_name,
    process_name,
    process_order,
    planned_amount,
    subcontractor_id
  )
  select
    p.id,
    p.order_no,
    coalesce(p.product_id, pm.id),
    coalesce(p.customer_id, cm.id),
    pp.id,
    coalesce(pm.product_code, p.product_code),
    coalesce(pm.product_name, p.product_name),
    coalesce(cm.customer_name, p.customer_name),
    pp.process_name,
    pp.process_order,
    p.order_amount,
    pp.subcontractor_id
  from posts p
  left join product_master pm
    on pm.id = p.product_id
    or pm.product_code = p.product_code
  left join customer_master cm
    on cm.id = p.customer_id
    or cm.customer_name = p.customer_name
  join product_processes pp
    on pp.product_id = coalesce(p.product_id, pm.id)
    or pp.product_code = coalesce(pm.product_code, p.product_code)
  where p.id = p_post_id
    and not exists (
      select 1
      from order_processes op
      where op.post_id = p.id
        and op.process_order = pp.process_order
    )
  order by pp.process_order;
end;
$$ language plpgsql;

grant execute on function create_order_processes_for_post(uuid) to anon, authenticated;
