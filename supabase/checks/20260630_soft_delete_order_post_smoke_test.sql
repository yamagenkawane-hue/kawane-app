-- Self-contained smoke test for soft_delete_order_post.
--
-- This script creates a temporary order with related workflow rows, calls
-- soft_delete_order_post, verifies cleanup, and finishes with ROLLBACK.
--
-- Expected result:
-- - result = PASSED
-- - related rows are deleted
-- - posts.delete becomes true
-- - inventory_items.allocated_stock is restored

begin;

create temp table smoke_test_result (
  result text,
  order_no text,
  post_deleted boolean,
  order_processes_after integer,
  production_results_after integer,
  production_schedules_after integer,
  shipments_after integer,
  inventory_allocations_after integer,
  allocated_stock_before integer,
  allocated_stock_after integer,
  message text
) on commit drop;

do $$
declare
  run_key text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  target_order_no text := 'SMOKE-DELETE-' || run_key;
  target_product_code text := 'SMOKE-DELETE-' || run_key;
  target_lot_no text := 'LOT-DELETE-' || run_key;
  target_post_id uuid;
  target_order_process_id uuid;
  target_schedule_id uuid;
  legacy_schedule_id uuid;
  target_inventory_id uuid;
  before_allocated integer := 0;
  after_allocated integer := 0;
  post_deleted boolean := false;
  order_processes_after integer := 0;
  production_results_after integer := 0;
  production_schedules_after integer := 0;
  shipments_after integer := 0;
  inventory_allocations_after integer := 0;
begin
  insert into posts (
    order_no,
    lot_no,
    product_code,
    product_name,
    customer_name,
    order_amount,
    completion_scheduled_date,
    delivery_date,
    status,
    "delete"
  ) values (
    target_order_no,
    target_lot_no,
    target_product_code,
    'スモークテスト 削除',
    'スモークテスト',
    5,
    current_date,
    current_date + 1,
    '未着手',
    false
  )
  returning id into target_post_id;

  insert into inventory_items (
    product_code,
    product_name,
    lot_no,
    current_stock,
    allocated_stock,
    updated_at
  ) values (
    target_product_code,
    'スモークテスト 削除',
    target_lot_no,
    10,
    5,
    now()
  )
  returning id into target_inventory_id;

  insert into order_processes (
    post_id,
    order_no,
    product_code,
    product_name,
    customer_name,
    process_name,
    process_order,
    planned_amount,
    completed_amount
  ) values (
    target_post_id,
    target_order_no,
    target_product_code,
    'スモークテスト 削除',
    'スモークテスト',
    '梱包',
    1,
    5,
    2
  )
  returning id into target_order_process_id;

  insert into production_schedules (
    post_id,
    order_no,
    customer_name,
    product_name,
    press_number,
    lot_no,
    plan_amount,
    press_completed_amount,
    shipping_scheduled_start,
    shipping_scheduled_end,
    created_at,
    updated_at
  ) values (
    target_post_id,
    target_order_no,
    'スモークテスト',
    'スモークテスト 削除',
    target_product_code,
    target_lot_no,
    5,
    2,
    current_date,
    current_date + 1,
    now(),
    now()
  )
  returning id into target_schedule_id;

  -- Legacy-style schedule row without post_id should also be deleted by order_no.
  insert into production_schedules (
    post_id,
    order_no,
    customer_name,
    product_name,
    press_number,
    lot_no,
    plan_amount,
    press_completed_amount,
    shipping_scheduled_start,
    shipping_scheduled_end,
    created_at,
    updated_at
  ) values (
    null,
    target_order_no,
    'スモークテスト',
    'スモークテスト 削除',
    target_product_code,
    target_lot_no,
    5,
    0,
    current_date,
    current_date + 1,
    now(),
    now()
  )
  returning id into legacy_schedule_id;

  insert into production_results (
    schedule_id,
    post_id,
    order_process_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values
  (
    target_schedule_id,
    target_post_id,
    target_order_process_id,
    target_order_process_id::text,
    '梱包',
    current_date,
    2,
    now()
  ),
  (
    legacy_schedule_id,
    null,
    null,
    legacy_schedule_id::text,
    '製造',
    current_date,
    1,
    now()
  );

  insert into inventory_allocations (
    post_id,
    inventory_item_id,
    product_code,
    lot_no,
    allocated_amount,
    shipped_amount,
    confirmed_at
  ) values (
    target_post_id,
    target_inventory_id,
    target_product_code,
    target_lot_no,
    5,
    0,
    now()
  );

  insert into shipments (
    post_id,
    order_no,
    customer_name,
    product_name,
    lot_no,
    scheduled_date,
    delivery_date,
    order_amount,
    quantity,
    created_at,
    updated_at
  ) values
  (
    target_post_id,
    target_order_no,
    'スモークテスト',
    'スモークテスト 削除',
    target_lot_no,
    current_date,
    current_date + 1,
    5,
    2,
    now(),
    now()
  ),
  (
    null,
    target_order_no,
    'スモークテスト',
    'スモークテスト 削除',
    target_lot_no,
    current_date,
    current_date + 1,
    5,
    1,
    now(),
    now()
  );

  select allocated_stock
  into before_allocated
  from inventory_items
  where id = target_inventory_id;

  perform soft_delete_order_post(target_post_id);

  select coalesce("delete", false)
  into post_deleted
  from posts
  where id = target_post_id;

  select count(*)::integer
  into order_processes_after
  from order_processes
  where post_id = target_post_id;

  select count(*)::integer
  into production_results_after
  from production_results
  where post_id = target_post_id
     or order_process_id = target_order_process_id
     or schedule_id in (target_schedule_id, legacy_schedule_id);

  select count(*)::integer
  into production_schedules_after
  from production_schedules
  where post_id = target_post_id
     or (post_id is null and nullif(trim(order_no), '') = target_order_no);

  select count(*)::integer
  into shipments_after
  from shipments
  where post_id = target_post_id
     or (post_id is null and nullif(trim(order_no), '') = target_order_no);

  select count(*)::integer
  into inventory_allocations_after
  from inventory_allocations
  where post_id = target_post_id;

  select allocated_stock
  into after_allocated
  from inventory_items
  where id = target_inventory_id;

  insert into smoke_test_result (
    result,
    order_no,
    post_deleted,
    order_processes_after,
    production_results_after,
    production_schedules_after,
    shipments_after,
    inventory_allocations_after,
    allocated_stock_before,
    allocated_stock_after,
    message
  ) values (
    case
      when post_deleted = true
       and order_processes_after = 0
       and production_results_after = 0
       and production_schedules_after = 0
       and shipments_after = 0
       and inventory_allocations_after = 0
       and before_allocated = 5
       and after_allocated = 0
      then 'PASSED'
      else 'FAILED'
    end,
    target_order_no,
    post_deleted,
    order_processes_after,
    production_results_after,
    production_schedules_after,
    shipments_after,
    inventory_allocations_after,
    before_allocated,
    after_allocated,
    case
      when post_deleted = true
       and order_processes_after = 0
       and production_results_after = 0
       and production_schedules_after = 0
       and shipments_after = 0
       and inventory_allocations_after = 0
       and before_allocated = 5
       and after_allocated = 0
      then '受注削除で関連データが削除され、在庫引当数も戻りました'
      else '受注削除後の関連データまたは在庫引当数が想定と異なります'
    end
  );
end;
$$;

select * from smoke_test_result;

rollback;
