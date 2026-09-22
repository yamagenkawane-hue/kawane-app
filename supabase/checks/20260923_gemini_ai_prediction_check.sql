select
  'ai_prediction_settings_columns' as check_name,
  case when count(*) = 5 then 'PASSED' else 'FAILED' end as result,
  count(*) as actual_count,
  'AI prediction settings columns exist.' as message
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ai_prediction_settings'
  and column_name in (
    'priority_reference_days',
    'max_reference_days',
    'manufacturing_min_business_days',
    'other_process_min_lots',
    'validation_mode'
  )

union all

select
  'ai_prediction_tables',
  case when count(*) = 6 then 'PASSED' else 'FAILED' end,
  count(*),
  'All Gemini prediction tables exist.'
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'ai_prediction_reference_starts',
    'ai_prediction_runs',
    'ai_prediction_input_snapshots',
    'ai_prediction_results',
    'ai_prediction_latest',
    'ai_prediction_evaluations'
  )

union all

select
  'ai_prediction_default_settings',
  case when count(*) = 1 then 'PASSED' else 'FAILED' end,
  count(*),
  'Global AI prediction settings row exists.'
from ai_prediction_settings
where id = 'global'
  and priority_reference_days >= 1
  and max_reference_days >= priority_reference_days
  and manufacturing_min_business_days >= 1
  and other_process_min_lots >= 1;
