create table if not exists ai_prediction_settings (
  id text primary key default 'global',
  enabled boolean not null default true,
  target_outsource_delay boolean not null default true,
  target_shipping_delay boolean not null default true,
  target_line_load boolean not null default true,
  strength text not null default 'standard',
  use_line_operation_rate boolean not null default true,
  use_past_results boolean not null default false,
  use_outsource_process boolean not null default true,
  use_holidays boolean not null default true,
  use_current_delay boolean not null default true,
  use_process_average_delay boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint ai_prediction_settings_singleton_chk check (id = 'global'),
  constraint ai_prediction_settings_strength_chk
    check (strength in ('weak', 'standard', 'strong'))
);

insert into ai_prediction_settings (id)
values ('global')
on conflict (id) do nothing;
