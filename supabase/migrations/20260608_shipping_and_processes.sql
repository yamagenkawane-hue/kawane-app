alter table production_schedules
  add column if not exists shipping_scheduled_start date,
  add column if not exists shipping_scheduled_end date;

create table if not exists subcontractors (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists product_processes (
  id uuid primary key default gen_random_uuid(),
  product_code varchar(100) not null,
  process_name varchar(100) not null,
  process_order integer not null,
  subcontractor_id uuid references subcontractors(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete set null,
  order_no text not null,
  customer_name varchar(100) not null,
  product_name text not null,
  lot_no varchar(50) not null,
  scheduled_date date not null,
  delivery_date date,
  order_amount integer,
  quantity integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function deduct_inventory(
  p_product_code text,
  p_lot_no text,
  p_quantity integer
) returns void as $$
begin
  update inventory_items
  set current_stock = current_stock - p_quantity,
      updated_at = now()
  where product_code = p_product_code
    and lot_no = p_lot_no
    and current_stock >= p_quantity;

  if not found then
    raise exception '在庫レコードが見つからないか、在庫数が不足しています';
  end if;
end;
$$ language plpgsql;
