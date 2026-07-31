-- Remove the unused standard day count from process_master.
-- Scheduling now uses line capacity, operation rate, holidays, overlap days,
-- and AI prediction settings instead of process_master.days.

drop view if exists v_product_processes_with_master;

create view v_product_processes_with_master as
select
  pp.id,
  pp.product_id,
  coalesce(pm.product_code, pp.product_code) as product_code,
  pm.product_name,
  pm.customer_id,
  cm.customer_name,
  pp.process_master_id,
  coalesce(pr.process_id, pp.process_name) as process_id,
  coalesce(pr.name, pp.process_name) as process_name,
  pp.process_order,
  coalesce(pr.enabled, true) as enabled,
  coalesce(pr.outsourcing, false) as outsourcing,
  pp.subcontractor_id,
  sc.name as subcontractor_name,
  pp.created_at,
  pp.updated_at,
  coalesce(pp.overlap_days, 0) as overlap_days
from product_processes pp
left join product_master pm
  on pm.id = pp.product_id
left join customer_master cm
  on cm.id = pm.customer_id
left join process_master pr
  on pr.id = pp.process_master_id
left join subcontractors sc
  on sc.id = pp.subcontractor_id;

alter table process_master
  drop column if exists days;
