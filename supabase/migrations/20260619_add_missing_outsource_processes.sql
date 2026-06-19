-- Add missing process master rows used by product_processes.
-- Safe to run more than once.

insert into process_master (
  process_id,
  name,
  days,
  sort,
  enabled,
  outsourcing
)
select
  values_to_insert.process_id,
  values_to_insert.name,
  values_to_insert.days,
  values_to_insert.sort,
  true,
  true
from (
  values
    ('plating', 'メッキ', 1, 3),
    ('surface_treatment', '表面処理', 1, 2),
    ('outsourced_finishing', '外注仕上げ', 1, 3)
) as values_to_insert(process_id, name, days, sort)
where not exists (
  select 1
  from process_master pm
  where pm.name = values_to_insert.name
     or pm.process_id = values_to_insert.process_id
);

update product_processes pp
set process_master_id = pm.id,
    updated_at = now()
from process_master pm
where pp.process_master_id is null
  and (
    pp.process_name = pm.name
    or pp.process_name = pm.process_id
  );
