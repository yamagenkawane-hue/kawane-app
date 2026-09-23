-- Configurable fallback dates for outsourcing processes without a sent date.

alter table ai_prediction_settings
  add column if not exists outsource_default_sent_offset_days integer not null default 0,
  add column if not exists outsource_default_return_offset_days integer not null default 3;

alter table ai_prediction_settings
  drop constraint if exists ai_prediction_settings_outsource_default_dates_chk;

alter table ai_prediction_settings
  add constraint ai_prediction_settings_outsource_default_dates_chk check (
    outsource_default_sent_offset_days >= 0
    and outsource_default_return_offset_days >= outsource_default_sent_offset_days
  );

select
  'ai_prediction_outsource_default_dates' as check_name,
  case
    when outsource_default_sent_offset_days >= 0
      and outsource_default_return_offset_days >= outsource_default_sent_offset_days
    then 'PASSED'
    else 'FAILED'
  end as result,
  2 as actual_count,
  format(
    'sent=%s day(s), return=%s day(s) after prediction date.',
    outsource_default_sent_offset_days,
    outsource_default_return_offset_days
  ) as message
from ai_prediction_settings
where id = 'global';
