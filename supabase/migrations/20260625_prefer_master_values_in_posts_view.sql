-- Prefer master-table values in v_posts_with_master while keeping legacy text
-- columns as fallback. This is the first safe step toward removing duplicated
-- product/customer text from workflow tables later.

drop view if exists v_posts_with_master;

create or replace view v_posts_with_master as
with shipment_totals as (
  select
    s.post_id,
    sum(coalesce(s.quantity, 0)) as shipped_amount
  from shipments s
  group by s.post_id
), process_totals as (
  select
    op.post_id,
    sum(
      case
        when op.process_order = 1 or op.process_name like '%製造%' or op.process_name like '%プレス%'
          then coalesce(op.completed_amount, 0)
        else 0
      end
    ) as manufacturing_amount,
    sum(
      case when op.process_name like '%洗浄%'
        then coalesce(op.completed_amount, 0)
        else 0
      end
    ) as cleaning_amount,
    sum(
      case when op.process_name like '%検査%'
        then coalesce(op.completed_amount, 0)
        else 0
      end
    ) as inspection_amount,
    sum(
      case when op.process_name like '%計量%'
        then coalesce(op.completed_amount, 0)
        else 0
      end
    ) as measurement_amount,
    sum(
      case when op.process_name like '%梱包%' or op.process_name like '%包装%'
        then coalesce(op.completed_amount, 0)
        else 0
      end
    ) as packaging_amount
  from order_processes op
  group by op.post_id
), final_process as (
  select distinct on (op.post_id)
    op.post_id,
    coalesce(op.completed_amount, 0) as completed_amount
  from order_processes op
  order by op.post_id, op.process_order desc, op.updated_at desc nulls last, op.created_at desc nulls last
), outsource_statuses as (
  select
    op.post_id,
    bool_or(
      op.outsource_status = 'returned'
      or op.outsource_returned_date is not null
      or (
        coalesce(op.planned_amount, 0) > 0
        and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
      )
    ) as has_returned,
    bool_or(
      op.subcontractor_id is not null
      or op.outsource_sent_date is not null
      or op.outsource_returned_date is not null
      or op.outsource_status in ('sent', 'returned')
    ) as has_outsource
  from order_processes op
  where
    op.subcontractor_id is not null
    or op.outsource_sent_date is not null
    or op.outsource_returned_date is not null
    or op.outsource_status in ('sent', 'returned')
  group by op.post_id
)
select
  p.id,
  p.order_no,
  p.lot_no,
  coalesce(pm.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, p.product_name) as product_name,
  p.product_id,
  coalesce(cm.customer_name, p.customer_name) as customer_name,
  p.customer_id,
  p.order_amount,
  p.order_amount as remaining_amount,
  p.completion_scheduled_date,
  p.manufacturing_date,
  p.cleaning_date,
  p.inspection_date,
  p.measurement_date,
  p.packaging_date,
  p.delivery_date,
  p.shipping_scheduled_start,
  p.shipping_scheduled_end,
  p.remark,
  case
    when coalesce(st.shipped_amount, 0) >= coalesce(p.order_amount, 0)
      and coalesce(p.order_amount, 0) > 0 then '出荷OK'
    when coalesce(os.has_outsource, false) and coalesce(os.has_returned, false) then '外注済'
    when coalesce(os.has_outsource, false) then '外注'
    when coalesce(fp.completed_amount, 0) >= coalesce(p.order_amount, 0)
      and coalesce(p.order_amount, 0) > 0 then '梱包完了'
    when coalesce(pt.packaging_amount, 0) > 0 then '梱包中'
    when coalesce(pt.measurement_amount, 0) > 0 then '計量中'
    when coalesce(pt.inspection_amount, 0) > 0 then '検査中'
    when coalesce(pt.cleaning_amount, 0) > 0 then '洗浄中'
    when coalesce(pt.manufacturing_amount, 0) > 0 then '製造中'
    else coalesce(nullif(p.status, ''), '未着手')
  end as status,
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
  on cm.id = p.customer_id
left join shipment_totals st
  on st.post_id = p.id
left join process_totals pt
  on pt.post_id = p.id
left join final_process fp
  on fp.post_id = p.id
left join outsource_statuses os
  on os.post_id = p.id;