select
  table_name,
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('posts', 'v_posts_with_master')
  and column_name in (
    'manufacturing_date',
    'cleaning_date',
    'inspection_date',
    'measurement_date',
    'packaging_date'
  )
order by table_name, column_name;
