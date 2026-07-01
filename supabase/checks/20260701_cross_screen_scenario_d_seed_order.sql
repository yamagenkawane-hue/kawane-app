-- Seed data for cross-screen scenario D: inventory allocation to shipment.
--
-- Run this once before scenario D if the previous scenario order no longer
-- appears in the backorder/order-balance screen.
--
-- It creates:
-- - target order: ZJ-TEST-004
-- - order amount: 1200
-- - completed final-process amount: 400
-- - expected allocation/shipment remaining amount: 800
-- - available inventory: 800
--
-- After this, refresh the order-balance screen, confirm inventory allocation,
-- register shipment, and run:
--   20260701_cross_screen_scenario_d_shipping_allocation_check.sql
-- with target_order_no = 'ZJ-TEST-004'.

create temp table if not exists scenario_d_seed_result (
  result text,
  order_no text,
  product_code text,
  product_name text,
  customer_name text,
  lot_no text,
  order_amount integer,
  completed_amount integer,
  expected_remaining_amount integer,
  inventory_stock integer,
  message text
) on commit drop;

delete from scenario_d_seed_result;

do $$
declare
  source_order_no text := 'ZJ-TEST-003';
  target_order_no text := 'ZJ-TEST-004';
  target_lot_no text := 'LOT-ZJ004-SHIP';
  source_post record;
  existing_post record;
  existing_post_id uuid;
  target_post_id uuid;
  target_process_id uuid;
  target_inventory_id uuid;
  existing_completed_amount integer := 0;
  existing_remaining_amount integer := 0;
  existing_available_stock integer := 0;
begin
  select *
    into source_post
    from posts
   where order_no = source_order_no
     and coalesce("delete", false) = false
   order by created_at desc
   limit 1;

  if not found then
    insert into scenario_d_seed_result (
      result,
      order_no,
      message
    ) values (
      'SKIPPED',
      target_order_no,
      'Source order ZJ-TEST-003 was not found. Create or keep a scenario C order before seeding scenario D.'
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
    select *
      into existing_post
      from posts
     where id = existing_post_id;

    select coalesce(op.completed_amount, 0)
      into existing_completed_amount
      from order_processes op
     where op.post_id = existing_post_id
     order by op.process_order desc
     limit 1;

    existing_completed_amount := coalesce(existing_completed_amount, 0);
    existing_remaining_amount := greatest(
      coalesce(existing_post.order_amount, 0) - existing_completed_amount,
      0
    );

    select coalesce(
      sum(greatest(ii.current_stock - coalesce(ii.allocated_stock, 0), 0)),
      0
    )::integer
      into existing_available_stock
      from inventory_items ii
     where ii.product_code = existing_post.product_code;

    if existing_remaining_amount > 0
       and existing_available_stock < existing_remaining_amount then
      select id
        into target_inventory_id
        from inventory_items
       where product_code = existing_post.product_code
         and lot_no = target_lot_no
       order by updated_at desc
       limit 1;

      if target_inventory_id is null then
        insert into inventory_items (
          product_code,
          product_name,
          product_id,
          lot_no,
          current_stock,
          allocated_stock,
          updated_at
        ) values (
          existing_post.product_code,
          existing_post.product_name,
          existing_post.product_id,
          target_lot_no,
          existing_remaining_amount,
          0,
          now()
        )
        returning id into target_inventory_id;
      else
        update inventory_items
           set current_stock = greatest(
                 current_stock,
                 coalesce(allocated_stock, 0) + existing_remaining_amount
               ),
               updated_at = now()
         where id = target_inventory_id;
      end if;
    end if;

    insert into scenario_d_seed_result (
      result,
      order_no,
      product_code,
      product_name,
      customer_name,
      lot_no,
      order_amount,
      completed_amount,
      expected_remaining_amount,
      inventory_stock,
      message
    )
    select
      case
        when existing_remaining_amount > 0
         and existing_available_stock < existing_remaining_amount
        then 'UPDATED'
        else 'SKIPPED'
      end,
      p.order_no,
      p.product_code,
      p.product_name,
      p.customer_name,
      target_lot_no,
      p.order_amount,
      existing_completed_amount,
      existing_remaining_amount,
      coalesce((
        select sum(greatest(ii.current_stock - coalesce(ii.allocated_stock, 0), 0))::integer
          from inventory_items ii
        where ii.product_code = p.product_code
      ), 0),
      case
        when existing_remaining_amount > 0
         and existing_available_stock < existing_remaining_amount
        then 'ZJ-TEST-004 already existed, so inventory was topped up for scenario D.'
        else 'ZJ-TEST-004 already exists. Use it for scenario D.'
      end
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
    1200,
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
    1200,
    400,
    current_date,
    false
  )
  returning id into target_process_id;

  insert into production_results (
    post_id,
    order_process_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values (
    target_post_id,
    target_process_id,
    target_process_id::text,
    '梱包',
    current_date,
    400,
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
    800,
    0,
    now()
  )
  returning id into target_inventory_id;

  insert into scenario_d_seed_result (
    result,
    order_no,
    product_code,
    product_name,
    customer_name,
    lot_no,
    order_amount,
    completed_amount,
    expected_remaining_amount,
    inventory_stock,
    message
  ) values (
    'CREATED',
    target_order_no,
    source_post.product_code,
    source_post.product_name,
    source_post.customer_name,
    target_lot_no,
    1200,
    400,
    800,
    800,
    'Refresh the order-balance screen, confirm inventory allocation, then register shipment.'
  );
end $$;

select *
from scenario_d_seed_result;
