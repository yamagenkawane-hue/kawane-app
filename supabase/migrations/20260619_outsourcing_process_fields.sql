-- Add outsourcing management fields to order processes.
-- Run this before using the outsourcing management screen's save action.

alter table order_processes
  add column if not exists outsource_sent_date date,
  add column if not exists outsource_expected_return_date date,
  add column if not exists outsource_returned_date date,
  add column if not exists outsource_status text not null default 'not_sent',
  add column if not exists outsource_note text;

create index if not exists order_processes_outsource_status_idx
  on order_processes (outsource_status);

create index if not exists order_processes_outsource_expected_return_idx
  on order_processes (outsource_expected_return_date);

create or replace view v_order_processes_with_master as
select
  op.id,
  op.post_id,
  p.order_no,
  op.product_id,
  coalesce(pm.product_code, op.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, op.product_name, p.product_name) as product_name,
  op.customer_id,
  coalesce(cm.customer_name, op.customer_name, p.customer_name) as customer_name,
  op.product_process_id,
  op.process_name,
  op.process_order,
  op.planned_amount,
  op.completed_amount,
  greatest(op.planned_amount - op.completed_amount, 0) as remaining_amount,
  case
    when op.planned_amount <= 0 then 0
    else round((op.completed_amount::numeric / op.planned_amount::numeric) * 100, 1)
  end as progress_rate,
  op.completed_date,
  op.subcontractor_id,
  sc.name as subcontractor_name,
  op.outsource_sent_date,
  op.outsource_expected_return_date,
  op.outsource_returned_date,
  op.outsource_status,
  op.outsource_note,
  op.locked,
  p.delivery_date,
  p.completion_scheduled_date,
  op.created_at,
  op.updated_at
from order_processes op
left join posts p
  on p.id = op.post_id
left join product_master pm
  on pm.id = op.product_id
left join customer_master cm
  on cm.id = op.customer_id
left join subcontractors sc
  on sc.id = op.subcontractor_id;
