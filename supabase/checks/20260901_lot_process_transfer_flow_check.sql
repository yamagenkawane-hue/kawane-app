-- Check current lot movement state after production result registration.
-- Run this after registering a manufacturing/process result from the UI.

with recent_lots as (
  select
    l.id,
    l.order_no,
    l.lot_no,
    l.material_lot_no,
    l.product_name,
    l.customer_name,
    l.quantity,
    l.measured_amount,
    l.inventory_amount,
    l.created_at
  from lots l
  where coalesce(l.deleted, false) = false
  order by l.updated_at desc nulls last, l.created_at desc
  limit 10
),
balance_summary as (
  select
    lpb.lot_id,
    string_agg(
      concat(lpb.process_order, '.', lpb.process_name, ':', lpb.quantity),
      ' / '
      order by lpb.process_order
    ) as current_process_balances,
    sum(lpb.quantity) as current_process_total
  from lot_process_balance lpb
  join recent_lots rl on rl.id = lpb.lot_id
  where lpb.quantity > 0
  group by lpb.lot_id
),
history_summary as (
  select
    pth.lot_id,
    count(*) as history_count,
    max(pth.created_at) as last_moved_at
  from process_transfer_history pth
  join recent_lots rl on rl.id = pth.lot_id
  group by pth.lot_id
)
select
  concat('lot_flow:', rl.order_no, ':', rl.lot_no) as check_name,
  case
    when coalesce(hs.history_count, 0) > 0 then 'INFO'
    else 'FAILED'
  end as result,
  coalesce(bs.current_process_total, 0)::integer as actual_count,
  concat(
    'product=', coalesce(rl.product_name, '-'),
    ', customer=', coalesce(rl.customer_name, '-'),
    ', material_lot=', coalesce(rl.material_lot_no, '-'),
    ', lot_quantity=', coalesce(rl.quantity, 0),
    ', current_process=',
    coalesce(bs.current_process_balances, '工程残なし'),
    ', history_count=', coalesce(hs.history_count, 0),
    ', last_moved_at=', coalesce(hs.last_moved_at::text, '-')
  ) as message
from recent_lots rl
left join balance_summary bs on bs.lot_id = rl.id
left join history_summary hs on hs.lot_id = rl.id

union all

select
  concat('transfer_history:', rl.order_no, ':', rl.lot_no) as check_name,
  'INFO' as result,
  pth.quantity::integer as actual_count,
  concat(
    coalesce(pth.from_process_name, '開始'),
    ' -> ',
    coalesce(pth.to_process_name, '在庫'),
    ', movement_type=', pth.movement_type,
    ', created_at=', pth.created_at
  ) as message
from recent_lots rl
join process_transfer_history pth on pth.lot_id = rl.id
order by check_name, message;
