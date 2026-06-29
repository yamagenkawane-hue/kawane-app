-- Remove unused process date columns from v_posts_with_master.
-- manufacturing_date is kept temporarily as a legacy schedule-start fallback.

drop view if exists v_posts_with_master;

create or replace view v_posts_with_master as
select
  p.id,
  p.order_no,
  p.lot_no,
  p.product_code,
  p.product_name,
  p.product_id,
  p.customer_name,
  p.customer_id,
  p.order_amount,
  p.order_amount as remaining_amount,
  p.completion_scheduled_date,
  p.manufacturing_date,
  p.delivery_date,
  p.shipping_scheduled_start,
  p.shipping_scheduled_end,
  p.remark,
  p.status,
  p.delete,
  p.created_at,
  p.updated_at,
  pm.product_code as master_product_code,
  pm.product_name as master_product_name,
  pm.standard as master_standard,
  pm.unit as master_unit,
  cm.customer_name as master_customer_name,
  cm.shipping_offset_days as master_shipping_offset_days
from posts p
left join product_master pm
  on pm.id = p.product_id
left join customer_master cm
  on cm.id = p.customer_id;
