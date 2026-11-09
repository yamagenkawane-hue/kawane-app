-- Column/default fixture from the current schema. No business rows or credentials.

create table public."ai_prediction_runs" (
  "id" uuid default gen_random_uuid() primary key,
  "trigger_type" text,
  "status" text default 'running'::text,
  "model" text default 'gemini-3.8-flash'::text,
  "started_at" timestamp with time zone default now(),
  "finished_at" timestamp with time zone,
  "target_count" integer default 0,
  "success_count" integer default 0,
  "failed_count" integer default 0,
  "skipped_count" integer default 0,
  "error_code" text,
  "error_message" text,
  "settings_snapshot" jsonb default '{}'::jsonb
);

create table public."ai_prediction_settings" (
  "id" text default 'global'::text primary key,
  "enabled" boolean default true,
  "target_outsource_delay" boolean default true,
  "target_shipping_delay" boolean default true,
  "target_line_load" boolean default true,
  "strength" text default 'standard'::text,
  "use_line_operation_rate" boolean default true,
  "use_past_results" boolean default false,
  "use_outsource_process" boolean default true,
  "use_holidays" boolean default true,
  "use_current_delay" boolean default true,
  "use_process_average_delay" boolean default false,
  "updated_at" timestamp with time zone default now(),
  "priority_reference_days" integer default 90,
  "max_reference_days" integer default 730,
  "manufacturing_min_business_days" integer default 5,
  "other_process_min_lots" integer default 5,
  "validation_mode" boolean default true,
  "outsource_default_sent_offset_days" integer default 0,
  "outsource_default_return_offset_days" integer default 3
);

create table public."customer_master" (
  "id" uuid default gen_random_uuid() primary key,
  "customer_name" text,
  "shipping_offset_days" integer default 0,
  "note" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "customer_name_kana" text default ''::text
);

create table public."inventory_allocations" (
  "id" uuid default gen_random_uuid() primary key,
  "post_id" uuid,
  "inventory_item_id" uuid,
  "product_code" text,
  "lot_no" text,
  "allocated_amount" integer,
  "confirmed_at" timestamp with time zone default now(),
  "shipped_amount" integer default 0,
  "product_id" uuid,
  "lot_id" uuid
);

create table public."inventory_items" (
  "id" uuid default gen_random_uuid() primary key,
  "product_code" text,
  "product_name" text,
  "lot_no" text,
  "current_stock" integer default 0,
  "updated_at" timestamp with time zone default now(),
  "allocated_stock" integer default 0,
  "product_id" uuid,
  "lot_id" uuid
);

create table public."lot_process_balance" (
  "id" uuid default gen_random_uuid() primary key,
  "post_id" uuid,
  "order_process_id" uuid,
  "lot_id" uuid,
  "process_name" text,
  "process_order" integer,
  "quantity" integer default 0,
  "source_result_id" uuid,
  "version" integer default 1,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

create table public."lots" (
  "id" uuid default gen_random_uuid() primary key,
  "lot_no" text,
  "lot_type" text default 'normal'::text,
  "product_name" text,
  "customer_name" text,
  "quantity" integer default 0,
  "status" text default '計画中'::text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "product_id" uuid,
  "customer_id" uuid,
  "post_id" uuid,
  "order_no" text,
  "product_code" text,
  "material_lot_no" text,
  "measurement_result_id" uuid,
  "measurement_order_process_id" uuid,
  "measured_amount" integer default 0,
  "packaged_amount" integer default 0,
  "inventory_amount" integer default 0,
  "allocated_amount" integer default 0,
  "shipped_amount" integer default 0,
  "measured_at" date,
  "packaged_at" date,
  "last_shipped_at" date,
  "note" text,
  "deleted" boolean default false,
  "deleted_at" timestamp with time zone,
  "deleted_reason" text,
  "measured_weight" numeric default 0
);

create table public."order_processes" (
  "id" uuid default gen_random_uuid() primary key,
  "post_id" uuid,
  "order_no" text,
  "product_code" text,
  "product_name" text,
  "customer_name" text,
  "process_name" text,
  "process_order" integer,
  "planned_amount" integer default 0,
  "completed_amount" integer default 0,
  "completed_date" date,
  "subcontractor_id" uuid,
  "locked" boolean default false,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "product_id" uuid,
  "customer_id" uuid,
  "product_process_id" uuid,
  "outsource_sent_date" date,
  "outsource_expected_return_date" date,
  "outsource_returned_date" date,
  "outsource_status" text default 'not_sent'::text,
  "outsource_note" text,
  "overlap_days" integer default 0
);

create table public."outsource_remainder_schedules" (
  "id" uuid primary key,
  "order_process_id" uuid,
  "dispatch_no" integer,
  "quantity" integer,
  "moved_amount" integer default 0,
  "sent_date" date,
  "expected_date" date,
  "returned_date" date,
  "note" text default ''::text,
  "cancelled" boolean default false,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

create table public."posts" (
  "id" uuid default gen_random_uuid() primary key,
  "order_no" text,
  "product_code" text,
  "product_name" text,
  "customer_name" text,
  "order_amount" bigint default '0'::bigint,
  "delivery_date" date,
  "remark" text,
  "status" text default '未着手'::text,
  "delete" boolean default false,
  "created_by" timestamp without time zone,
  "updated_by" timestamp without time zone,
  "created_at" timestamp without time zone,
  "updated_at" timestamp without time zone,
  "lot_no" text,
  "completion_scheduled_date" date,
  "shipping_scheduled_start" date,
  "shipping_scheduled_end" date,
  "product_id" uuid,
  "customer_id" uuid,
  "measurement_registration_hidden" boolean default false,
  "shipment_closed_at" timestamp with time zone
);

create table public."process_transfer_history" (
  "id" uuid default gen_random_uuid() primary key,
  "post_id" uuid,
  "lot_id" uuid,
  "from_order_process_id" uuid,
  "to_order_process_id" uuid,
  "from_process_name" text,
  "to_process_name" text,
  "from_process_order" integer,
  "to_process_order" integer,
  "quantity" integer,
  "movement_type" text,
  "source_result_id" uuid,
  "before_from_quantity" integer,
  "after_from_quantity" integer,
  "before_to_quantity" integer,
  "after_to_quantity" integer,
  "correction_quantity" integer,
  "reason" text,
  "idempotency_key" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now(),
  "outsource_remainder_schedule_id" uuid
);

create table public."product_master" (
  "id" uuid default gen_random_uuid() primary key,
  "product_code" text,
  "product_name" text,
  "standard" text,
  "unit" text default '個'::text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "customer_name" character varying(100),
  "customer_id" uuid,
  "unit_weight" numeric default 0,
  "plan_amount" integer default 0
);

create table public."production_results" (
  "id" uuid default gen_random_uuid() primary key,
  "schedule_id" uuid,
  "post_id" uuid,
  "process_id" text,
  "process_name" text,
  "date" date,
  "amount" integer default 0,
  "created_at" timestamp with time zone default now(),
  "order_process_id" uuid,
  "lot_id" uuid
);

create table public."production_schedules" (
  "id" uuid default gen_random_uuid() primary key,
  "customer_name" text,
  "product_name" text,
  "press_number" text,
  "lot_no" text,
  "plan_amount" integer default 0,
  "press_completed_amount" integer default 0,
  "press_completed_date" date,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "shipping_scheduled_start" date,
  "shipping_scheduled_end" date,
  "order_no" text,
  "schedule_no" text,
  "post_id" uuid,
  "product_id" uuid,
  "customer_id" uuid,
  "department" text default '製造G'::text
);

create table public."shipments" (
  "id" uuid default gen_random_uuid() primary key,
  "post_id" uuid,
  "order_no" text,
  "customer_name" character varying(100),
  "product_name" text,
  "lot_no" text,
  "scheduled_date" date,
  "delivery_date" date,
  "order_amount" integer,
  "quantity" integer,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "product_id" uuid,
  "customer_id" uuid,
  "product_code" text,
  "lot_id" uuid,
  "cancelled" boolean default false,
  "cancelled_at" timestamp with time zone,
  "cancelled_reason" text,
  "idempotency_key" text,
  "inventory_movements" jsonb
);

alter table lots add constraint lots_lot_no_key unique(lot_no);
alter table inventory_items add constraint inventory_items_product_name_lot_no_key unique(product_name,lot_no);
create unique index lots_post_lot_material_unique_idx on lots(post_id,lot_no,coalesce(material_lot_no,'')) where post_id is not null and nullif(trim(lot_no),'') is not null;
create unique index process_transfer_history_idempotency_key_unique_idx on process_transfer_history(idempotency_key) where idempotency_key is not null;
create unique index lot_process_balance_lot_process_unique_idx on lot_process_balance(lot_id,order_process_id);
alter table lots alter column lot_no set not null,alter column product_name set not null,alter column customer_name set not null;
alter table inventory_items alter column product_name set not null;
alter table inventory_items add foreign key(lot_id) references lots(id) on delete set null;
alter table production_results add foreign key(lot_id) references lots(id) on delete set null;
create view v_posts_with_master as select * from posts;