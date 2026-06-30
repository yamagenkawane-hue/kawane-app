-- Fix v_posts_with_master.status so a completed non-packaging final process
-- is not displayed as packaging completion.

drop view if exists v_posts_with_master;

create or replace view v_posts_with_master as
with shipment_totals as (
  select
    s.post_id,
    sum(coalesce(s.quantity, 0)) as shipped_amount
  from shipments s
  group by s.post_id
), latest_process_status as (
  select distinct on (op.post_id)
    op.post_id,
    op.process_order,
    case
      when op.process_name like '%梱包%' or op.process_name like '%包装%' then
        case
          when coalesce(op.planned_amount, 0) > 0
           and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
          then '梱包完了'
          else '梱包中'
        end
      when op.process_name like '%計量%' then
        case
          when coalesce(op.planned_amount, 0) > 0
           and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
          then '計量完了'
          else '計量中'
        end
      when op.process_name like '%検査%' then
        case
          when coalesce(op.planned_amount, 0) > 0
           and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
          then '検査完了'
          else '検査中'
        end
      when op.process_name like '%洗浄%' then
        case
          when coalesce(op.planned_amount, 0) > 0
           and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
          then '洗浄完了'
          else '洗浄中'
        end
      else
        case
          when coalesce(op.planned_amount, 0) > 0
           and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
          then '製造完了'
          else '製造中'
        end
    end as process_status
  from order_processes op
  where coalesce(op.completed_amount, 0) > 0
  order by op.post_id, op.process_order desc, op.updated_at desc nulls last, op.created_at desc nulls last
), active_outsource_processes as (
  select
    op.post_id,
    op.outsource_status,
    op.outsource_returned_date,
    op.planned_amount,
    op.completed_amount
  from order_processes op
  where
    (
      op.subcontractor_id is not null
      or op.outsource_sent_date is not null
      or op.outsource_returned_date is not null
      or op.outsource_status in ('sent', 'returned')
    )
    and (
      op.outsource_sent_date is not null
      or op.outsource_returned_date is not null
      or op.outsource_status in ('sent', 'returned')
      or (
        coalesce(op.planned_amount, 0) > 0
        and coalesce(op.completed_amount, 0) >= coalesce(op.planned_amount, 0)
      )
    )
), outsource_statuses as (
  select
    aop.post_id,
    bool_or(
      aop.outsource_status = 'returned'
      or aop.outsource_returned_date is not null
      or (
        coalesce(aop.planned_amount, 0) > 0
        and coalesce(aop.completed_amount, 0) >= coalesce(aop.planned_amount, 0)
      )
    ) as has_returned,
    true as has_outsource
  from active_outsource_processes aop
  group by aop.post_id
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
  p.delivery_date,
  p.shipping_scheduled_start,
  p.shipping_scheduled_end,
  p.remark,
  case
    when coalesce(st.shipped_amount, 0) >= coalesce(p.order_amount, 0)
      and coalesce(p.order_amount, 0) > 0 then '出荷OK'
    when coalesce(os.has_outsource, false) and coalesce(os.has_returned, false) then '外注済'
    when coalesce(os.has_outsource, false) then '外注'
    when lps.process_status is not null then lps.process_status
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
left join latest_process_status lps
  on lps.post_id = p.id
left join outsource_statuses os
  on os.post_id = p.id;
