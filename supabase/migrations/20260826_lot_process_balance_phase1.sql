-- Phase 1 for the revised progress model.
-- Tracks current in-process quantities by lot and process, plus movement history.

create table if not exists lot_process_balance (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  order_process_id uuid not null references order_processes(id) on delete cascade,
  lot_id uuid not null references lots(id) on delete cascade,
  process_name text not null,
  process_order integer not null,
  quantity integer not null default 0,
  source_result_id uuid references production_results(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lot_process_balance_quantity_non_negative_chk check (quantity >= 0),
  constraint lot_process_balance_version_positive_chk check (version >= 1)
);

create unique index if not exists lot_process_balance_lot_process_unique_idx
  on lot_process_balance (lot_id, order_process_id);

create index if not exists lot_process_balance_post_process_idx
  on lot_process_balance (post_id, process_order);

create index if not exists lot_process_balance_lot_idx
  on lot_process_balance (lot_id);

create index if not exists lot_process_balance_order_process_idx
  on lot_process_balance (order_process_id);

create table if not exists process_transfer_history (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  lot_id uuid not null references lots(id) on delete cascade,
  from_order_process_id uuid references order_processes(id) on delete set null,
  to_order_process_id uuid references order_processes(id) on delete set null,
  from_process_name text,
  to_process_name text,
  from_process_order integer,
  to_process_order integer,
  quantity integer not null,
  movement_type text not null,
  source_result_id uuid references production_results(id) on delete set null,
  before_from_quantity integer,
  after_from_quantity integer,
  before_to_quantity integer,
  after_to_quantity integer,
  correction_quantity integer,
  reason text,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint process_transfer_history_quantity_positive_chk check (quantity > 0),
  constraint process_transfer_history_movement_type_chk check (
    movement_type in (
      'manufacturing_result',
      'process_transfer',
      'manual_edit',
      'quantity_correction',
      'stock_in',
      'allocate',
      'ship',
      'restore',
      'delete'
    )
  )
);

create unique index if not exists process_transfer_history_idempotency_unique_idx
  on process_transfer_history (idempotency_key)
  where idempotency_key is not null;

create index if not exists process_transfer_history_post_created_idx
  on process_transfer_history (post_id, created_at desc);

create index if not exists process_transfer_history_lot_created_idx
  on process_transfer_history (lot_id, created_at desc);

create index if not exists process_transfer_history_from_process_idx
  on process_transfer_history (from_order_process_id);

create index if not exists process_transfer_history_to_process_idx
  on process_transfer_history (to_order_process_id);

create or replace function set_lot_process_balance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists lot_process_balance_set_updated_at on lot_process_balance;
create trigger lot_process_balance_set_updated_at
before update on lot_process_balance
for each row
execute function set_lot_process_balance_updated_at();

create or replace view v_lot_process_balance_with_master as
select
  lpb.id,
  lpb.post_id,
  p.order_no,
  lpb.lot_id,
  l.lot_no,
  l.material_lot_no,
  lpb.order_process_id,
  lpb.process_name,
  lpb.process_order,
  lpb.quantity,
  lpb.source_result_id,
  lpb.version,
  op.planned_amount,
  op.completed_amount,
  op.completed_date,
  op.subcontractor_id,
  sc.name as subcontractor_name,
  coalesce(pm.id, p.product_id, l.product_id) as product_id,
  coalesce(pm.product_code, p.product_code, l.product_code) as product_code,
  coalesce(pm.product_name, p.product_name, l.product_name) as product_name,
  coalesce(cm.id, p.customer_id, l.customer_id) as customer_id,
  coalesce(cm.customer_name, p.customer_name, l.customer_name) as customer_name,
  p.order_amount,
  p.delivery_date,
  p.completion_scheduled_date,
  lpb.created_at,
  lpb.updated_at
from lot_process_balance lpb
join posts p on p.id = lpb.post_id
join lots l on l.id = lpb.lot_id
join order_processes op on op.id = lpb.order_process_id
left join product_master pm on pm.id = coalesce(op.product_id, p.product_id, l.product_id)
left join customer_master cm on cm.id = coalesce(op.customer_id, p.customer_id, l.customer_id)
left join subcontractors sc on sc.id = op.subcontractor_id
where coalesce(p.delete, false) = false
  and coalesce(l.deleted, false) = false
  and lpb.quantity > 0;

create or replace view v_process_transfer_history_with_master as
select
  pth.id,
  pth.post_id,
  p.order_no,
  pth.lot_id,
  l.lot_no,
  l.material_lot_no,
  pth.from_order_process_id,
  pth.to_order_process_id,
  pth.from_process_name,
  pth.to_process_name,
  pth.from_process_order,
  pth.to_process_order,
  pth.quantity,
  pth.movement_type,
  pth.source_result_id,
  pth.before_from_quantity,
  pth.after_from_quantity,
  pth.before_to_quantity,
  pth.after_to_quantity,
  pth.correction_quantity,
  pth.reason,
  pth.created_by,
  pth.created_at,
  coalesce(pm.id, p.product_id, l.product_id) as product_id,
  coalesce(pm.product_code, p.product_code, l.product_code) as product_code,
  coalesce(pm.product_name, p.product_name, l.product_name) as product_name,
  coalesce(cm.id, p.customer_id, l.customer_id) as customer_id,
  coalesce(cm.customer_name, p.customer_name, l.customer_name) as customer_name
from process_transfer_history pth
join posts p on p.id = pth.post_id
join lots l on l.id = pth.lot_id
left join product_master pm on pm.id = coalesce(p.product_id, l.product_id)
left join customer_master cm on cm.id = coalesce(p.customer_id, l.customer_id);

grant select, insert, update, delete on lot_process_balance to anon, authenticated;
grant select, insert, update, delete on process_transfer_history to anon, authenticated;
grant select on v_lot_process_balance_with_master to anon, authenticated;
grant select on v_process_transfer_history_with_master to anon, authenticated;
