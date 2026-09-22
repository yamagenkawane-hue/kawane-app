-- Gemini production prediction storage and configurable history thresholds.

alter table if exists ai_prediction_settings
  add column if not exists priority_reference_days integer not null default 90,
  add column if not exists max_reference_days integer not null default 730,
  add column if not exists manufacturing_min_business_days integer not null default 5,
  add column if not exists other_process_min_lots integer not null default 5,
  add column if not exists validation_mode boolean not null default true;

alter table if exists ai_prediction_settings
  drop constraint if exists ai_prediction_settings_reference_values_chk;

alter table if exists ai_prediction_settings
  add constraint ai_prediction_settings_reference_values_chk check (
    priority_reference_days >= 1
    and max_reference_days >= priority_reference_days
    and manufacturing_min_business_days >= 1
    and other_process_min_lots >= 1
  );

create table if not exists ai_prediction_reference_starts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references product_master(id) on delete cascade,
  process_id uuid references process_master(id) on delete cascade,
  reference_start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_prediction_reference_starts_scope_unique unique (product_id, process_id)
);

create table if not exists ai_prediction_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  status text not null default 'running',
  model text not null default 'gemini-3.8-flash',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  target_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  error_code text,
  error_message text,
  settings_snapshot jsonb not null default '{}'::jsonb,
  constraint ai_prediction_runs_trigger_chk check (trigger_type in ('manual', 'scheduled')),
  constraint ai_prediction_runs_status_chk check (status in ('running', 'succeeded', 'partial', 'failed', 'skipped'))
);

create unique index if not exists ai_prediction_runs_running_unique_idx
  on ai_prediction_runs ((status)) where status = 'running';

create table if not exists ai_prediction_input_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai_prediction_runs(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  order_process_id uuid references order_processes(id) on delete cascade,
  aggregate_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_prediction_input_snapshots_run_idx
  on ai_prediction_input_snapshots (run_id, post_id);

create table if not exists ai_prediction_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai_prediction_runs(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  order_process_id uuid references order_processes(id) on delete cascade,
  order_no text not null,
  process_name text not null,
  process_order integer not null,
  predicted_start_date date,
  predicted_end_date date,
  source_type text not null,
  status text not null default 'predicted',
  reason text not null default '',
  comments text[] not null default '{}',
  input_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_prediction_results_source_chk check (source_type in ('gemini', 'capacity', 'actual', 'unavailable')),
  constraint ai_prediction_results_status_chk check (status in ('predicted', 'confirmed', 'unavailable'))
);

create index if not exists ai_prediction_results_run_post_idx
  on ai_prediction_results (run_id, post_id, process_order);

create table if not exists ai_prediction_latest (
  post_id uuid not null references posts(id) on delete cascade,
  order_process_id uuid not null references order_processes(id) on delete cascade,
  run_id uuid not null references ai_prediction_runs(id) on delete cascade,
  order_no text not null,
  process_name text not null,
  process_order integer not null,
  predicted_start_date date,
  predicted_end_date date,
  source_type text not null,
  status text not null,
  reason text not null default '',
  comments text[] not null default '{}',
  input_summary jsonb not null default '{}'::jsonb,
  last_success_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, order_process_id)
);

create index if not exists ai_prediction_latest_post_order_idx
  on ai_prediction_latest (post_id, process_order);

create table if not exists ai_prediction_evaluations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  order_no text not null,
  prediction_run_id uuid references ai_prediction_runs(id) on delete set null,
  predicted_completion_date date,
  legacy_completion_date date,
  actual_completion_date date,
  business_day_error integer,
  lead_business_days integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_prediction_evaluations_post_idx
  on ai_prediction_evaluations (post_id, created_at desc);

grant select, insert, update, delete on ai_prediction_reference_starts to anon, authenticated;
grant select on ai_prediction_runs, ai_prediction_results, ai_prediction_latest, ai_prediction_evaluations to anon, authenticated;
grant select on ai_prediction_input_snapshots to authenticated;

comment on table ai_prediction_results is '90-day prediction history; cleanup is performed by the scheduled API.';
comment on table ai_prediction_latest is 'Latest successful prediction kept independently from 90-day history cleanup.';
