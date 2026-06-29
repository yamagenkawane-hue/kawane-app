select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v_posts_with_master'
  and column_name in (
    'manufacturing_date',
    'cleaning_date',
    'inspection_date',
    'measurement_date',
    'packaging_date'
  )
order by column_name;
