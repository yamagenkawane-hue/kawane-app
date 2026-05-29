alter table if exists posts
  add column if not exists lot_no text;

alter table if exists posts
  add column if not exists completion_scheduled_date date;

alter table if exists process_master
  add column if not exists outsourcing boolean default false;

create table if not exists production_schedules (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  product_name text not null,
  press_number text not null,
  lot_no text,
  plan_amount integer not null default 0,
  press_completed_amount integer not null default 0,
  press_completed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_results (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references production_schedules(id) on delete set null,
  post_id uuid references posts(id) on delete set null,
  process_id text not null,
  process_name text,
  date date not null,
  amount integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null unique,
  lot_type text not null default 'normal'
    check (lot_type in ('normal', 'trial', 'advance')),
  product_name text not null,
  customer_name text not null,
  quantity integer not null default 0,
  status text not null default '計画中',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_schedules_lot_no_idx
  on production_schedules(lot_no);

create index if not exists production_results_post_id_idx
  on production_results(post_id);

create index if not exists production_results_schedule_id_idx
  on production_results(schedule_id);

create table if not exists customer_master (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null unique,
  shipping_offset_days integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_master (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  product_name text not null,
  standard text,
  unit text not null default '個',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_master (
  id uuid primary key default gen_random_uuid(),
  material_code text not null unique,
  material_name text not null,
  supplier_name text,
  unit text not null default 'kg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_code text,
  product_name text not null,
  lot_no text,
  current_stock integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(product_name, lot_no)
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references inventory_items(id) on delete set null,
  transaction_type text not null,
  amount integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists shipment_records (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete set null,
  product_code text,
  product_name text not null,
  lot_no text,
  customer_name text not null,
  scheduled_date date not null,
  shipped_date date not null,
  shipped_amount integer not null default 0,
  carryover_amount integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shipment_records_scheduled_date_idx
  on shipment_records(scheduled_date);

create index if not exists inventory_items_product_lot_idx
  on inventory_items(product_name, lot_no);
