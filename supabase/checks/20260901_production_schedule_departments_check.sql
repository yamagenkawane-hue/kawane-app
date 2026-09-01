with checks as (
  select
    'production_schedules_department_column' as check_name,
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'production_schedules'
        and column_name = 'department'
        and is_nullable = 'NO'
        and column_default like '%製造G%'
    ) then 'PASSED' else 'FAILED' end as result,
    count(*)::integer as actual_count,
    'production_schedules has a non-null department column with default 製造G.' as message
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'production_schedules'
    and column_name = 'department'

  union all

  select
    'production_schedules_department_constraint',
    case when exists (
      select 1
      from pg_constraint
      where conname = 'production_schedules_department_chk'
        and conrelid = 'public.production_schedules'::regclass
    ) then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'production_schedules limits department to 製造G, 品質管理G, and 梱包出荷G.'
  from pg_constraint
  where conname = 'production_schedules_department_chk'
    and conrelid = 'public.production_schedules'::regclass

  union all

  select
    'production_schedules_department_index',
    case when exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'production_schedules'
        and indexname = 'production_schedules_department_idx'
    ) then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'production_schedules has an index for department filtering.'
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'production_schedules'
    and indexname = 'production_schedules_department_idx'

  union all

  select
    'production_schedule_view_department_column',
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'v_production_schedules_with_master'
        and column_name = 'department'
    ) then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'v_production_schedules_with_master exposes department for screen/API filtering.'
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_production_schedules_with_master'
    and column_name = 'department'

  union all

  select
    'production_schedule_department_values',
    case when count(*) = 0 then 'PASSED' else 'FAILED' end,
    count(*)::integer,
    'No production_schedules rows have an invalid department value.'
  from production_schedules
  where department not in ('製造G', '品質管理G', '梱包出荷G')
)
select *
from checks
order by check_name;
