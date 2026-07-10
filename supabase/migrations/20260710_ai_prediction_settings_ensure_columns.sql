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
  updated_at timestamptz not null default now()
);

alter table ai_prediction_settings
  add column if not exists enabled boolean not null default true,
  add column if not exists target_outsource_delay boolean not null default true,
  add column if not exists target_shipping_delay boolean not null default true,
  add column if not exists target_line_load boolean not null default true,
  add column if not exists strength text not null default 'standard',
  add column if not exists use_line_operation_rate boolean not null default true,
  add column if not exists use_past_results boolean not null default false,
  add column if not exists use_outsource_process boolean not null default true,
  add column if not exists use_holidays boolean not null default true,
  add column if not exists use_current_delay boolean not null default true,
  add column if not exists use_process_average_delay boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update ai_prediction_settings
set
  enabled = coalesce(enabled, true),
  target_outsource_delay = coalesce(target_outsource_delay, true),
  target_shipping_delay = coalesce(target_shipping_delay, true),
  target_line_load = coalesce(target_line_load, true),
  strength = case
    when strength in ('weak', 'standard', 'strong') then strength
    else 'standard'
  end,
  use_line_operation_rate = coalesce(use_line_operation_rate, true),
  use_past_results = coalesce(use_past_results, false),
  use_outsource_process = coalesce(use_outsource_process, true),
  use_holidays = coalesce(use_holidays, true),
  use_current_delay = coalesce(use_current_delay, true),
  use_process_average_delay = coalesce(use_process_average_delay, false),
  updated_at = coalesce(updated_at, now());

alter table ai_prediction_settings
  alter column enabled set default true,
  alter column enabled set not null,
  alter column target_outsource_delay set default true,
  alter column target_outsource_delay set not null,
  alter column target_shipping_delay set default true,
  alter column target_shipping_delay set not null,
  alter column target_line_load set default true,
  alter column target_line_load set not null,
  alter column strength set default 'standard',
  alter column strength set not null,
  alter column use_line_operation_rate set default true,
  alter column use_line_operation_rate set not null,
  alter column use_past_results set default false,
  alter column use_past_results set not null,
  alter column use_outsource_process set default true,
  alter column use_outsource_process set not null,
  alter column use_holidays set default true,
  alter column use_holidays set not null,
  alter column use_current_delay set default true,
  alter column use_current_delay set not null,
  alter column use_process_average_delay set default false,
  alter column use_process_average_delay set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_prediction_settings_singleton_chk'
  ) then
    alter table ai_prediction_settings
      add constraint ai_prediction_settings_singleton_chk check (id = 'global');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_prediction_settings_strength_chk'
  ) then
    alter table ai_prediction_settings
      add constraint ai_prediction_settings_strength_chk
      check (strength in ('weak', 'standard', 'strong'));
  end if;
end $$;

insert into ai_prediction_settings (id)
values ('global')
on conflict (id) do nothing;
