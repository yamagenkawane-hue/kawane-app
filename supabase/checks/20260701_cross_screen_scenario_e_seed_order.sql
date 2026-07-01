-- Seed data for cross-screen scenario E: delete order cleanup.
--
-- Run this before scenario E when the previous test order disappeared because
-- it was shipped/completed instead of deleted.
--
-- It creates:
-- - target order: ZJ-TEST-005
-- - order amount: 500
-- - completed final-process amount: 200
-- - inventory allocation: 300
-- - shipped amount: 100
-- - unshipped allocation to be restored on delete: 200
--
-- After this, refresh the order-balance screen, delete ZJ-TEST-005 from the UI,
-- and run:
--   20260701_cross_screen_scenario_e_delete_cleanup_check.sql
-- with target_order_no = 'ZJ-TEST-005'.

create temp table if not exists scenario_e_seed_result (
  result text,
  order_no text,
  product_code text,
  product_name text,
  customer_name text,
  lot_no text,
  order_amount integer,
  completed_amount integer,
  allocated_amount integer,
  shipped_amount integer,
  inventory_current_stock integer,
  inventory_allocated_stock integer,
  message text
) on commit drop;

delete from scenario_e_seed_result;

do $$
declare
  source_order_no text := 'ZJ-TEST-004';
  fallback_order_no text := 'ZJ-TEST-003';
  target_order_no text := 'ZJ-TEST-005';
  target_lot_no text := 'LOT-ZJ005-DELETE';
  source_post record;
  existing_post_id uuid;
  target_post_id uuid;
  target_process_id uuid;
  target_schedule_id uuid;
  target_inventory_id uuid;
begin
  select *
    into source_post
    from posts
   where order_no in (source_order_no, fallback_order_no)
     and coalesce("delete", false) = false
   order by case when order_no = source_order_no then 0 else 1 end, created_at desc
   limit 1;

  if not found then
    insert into scenario_e_seed_result (
      result,
      order_no,
      message
    ) values (
      'SKIPPED',
      target_order_no,
      'Source order ZJ-TEST-004 or ZJ-TEST-003 was not found.'
    );
    return;
  end if;

  select id
    into existing_post_id
    from posts
   where order_no = target_order_no
     and coalesce("delete", false) = false
   order by created_at desc
   limit 1;

  if existing_post_id is not null then
    insert into scenario_e_seed_result (
      result,
      order_no,
      product_code,
      product_name,
      customer_name,
      lot_no,
      message
    )
    select
      'SKIPPED',
      p.order_no,
      p.product_code,
      p.product_name,
      p.customer_name,
      target_lot_no,
      'ZJ-TEST-005 already exists. Use it for scenario E, or delete it manually if a reset is required.'
    from posts p
    where p.id = existing_post_id;
    return;
  end if;

  insert into posts (
    order_no,
    lot_no,
    product_code,
    product_name,
    product_id,
    customer_name,
    customer_id,
    order_amount,
    completion_scheduled_date,
    delivery_date,
    status,
    "delete",
    created_at,
    updated_at
  ) values (
    target_order_no,
    target_lot_no,
    source_post.product_code,
    source_post.product_name,
    source_post.product_id,
    source_post.customer_name,
    source_post.customer_id,
    500,
    current_date,
    current_date + 7,
    '梱包中',
    false,
    now(),
    now()
  )
  returning id into target_post_id;

  insert into order_processes (
    post_id,
    order_no,
    product_code,
    product_name,
    product_id,
    customer_name,
    customer_id,
    process_name,
    process_order,
    planned_amount,
    completed_amount,
    completed_date,
    locked
  ) values (
    target_post_id,
    target_order_no,
    source_post.product_code,
    source_post.product_name,
    source_post.product_id,
    source_post.customer_name,
    source_post.customer_id,
    '梱包',
    1,
    500,
    200,
    current_date,
    false
  )
  returning id into target_process_id;

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
    source_post.customer_name,
    source_post.product_name,
    source_post.product_code,
    target_lot_no,
    500,
    200,
    current_date,
    current_date + 7,
    now(),
    now()
  )
  returning id into target_schedule_id;

  insert into production_results (
    schedule_id,
    post_id,
    order_process_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values (
    target_schedule_id,
    target_post_id,
    target_process_id,
    target_process_id::text,
    '梱包',
    current_date,
    200,
    now()
  );

  insert into inventory_items (
    product_code,
    product_name,
    product_id,
    lot_no,
    current_stock,
    allocated_stock,
    updated_at
  ) values (
    source_post.product_code,
    source_post.product_name,
    source_post.product_id,
    target_lot_no,
    400,
    200,
    now()
  )
  returning id into target_inventory_id;

  insert into inventory_allocations (
    post_id,
    inventory_item_id,
    product_code,
    product_id,
    lot_no,
    allocated_amount,
    shipped_amount,
    confirmed_at
  ) values (
    target_post_id,
    target_inventory_id,
    source_post.product_code,
    source_post.product_id,
    target_lot_no,
    300,
    100,
    now()
  );

  insert into shipments (
    post_id,
    order_no,
    customer_name,
    product_name,
    product_id,
    customer_id,
    lot_no,
    scheduled_date,
    delivery_date,
    order_amount,
    quantity,
    created_at,
    updated_at
  ) values (
    target_post_id,
    target_order_no,
    source_post.customer_name,
    source_post.product_name,
    source_post.product_id,
    source_post.customer_id,
    target_lot_no,
    current_date,
    current_date + 7,
    500,
    100,
    now(),
    now()
  );

  insert into scenario_e_seed_result (
    result,
    order_no,
    product_code,
    product_name,
    customer_name,
    lot_no,
    order_amount,
    completed_amount,
    allocated_amount,
    shipped_amount,
    inventory_current_stock,
    inventory_allocated_stock,
    message
  ) values (
    'CREATED',
    target_order_no,
    source_post.product_code,
    source_post.product_name,
    source_post.customer_name,
    target_lot_no,
    500,
    200,
    300,
    100,
    400,
    200,
    'Refresh the order-balance screen, delete ZJ-TEST-005, then run the scenario E cleanup check.'
  );
end $$;

select *
from scenario_e_seed_result;
