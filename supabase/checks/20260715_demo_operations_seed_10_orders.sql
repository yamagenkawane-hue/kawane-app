-- Demo seed data for realistic operation checks.
--
-- Creates 10 active demo orders with mixed states:
-- - not started
-- - manufacturing in progress / completed
-- - outsourced plating sent / returned
-- - inspection completed and waiting for measurement
-- - measurement in progress / completed
-- - packaging in progress / completed with inventory
-- - inventory allocated and ready to ship
-- - partially shipped
--
-- Prefixes:
-- - order_no: DEMO-ORD-001 ... DEMO-ORD-010
-- - product_code: DEMO-P001 ... DEMO-P010
-- - lot_no: DEMO-LOT-001 ... DEMO-LOT-010
--
-- Re-running this SQL refreshes the same demo orders and removes their
-- generated child rows first. It does not touch non-demo data.

alter table posts
  add column if not exists measurement_registration_hidden boolean not null default false;

alter table shipments
  add column if not exists product_code text;

create temp table if not exists demo_seed_result (
  order_no text,
  product_code text,
  product_name text,
  customer_name text,
  order_amount integer,
  demo_state text,
  inventory_stock integer,
  allocated_amount integer,
  shipped_amount integer,
  message text
) on commit drop;

delete from demo_seed_result;

do $$
declare
  demo_customer_id uuid;
  demo_subcontractor_id uuid;
  process_rows text[] := array['製造', 'メッキ', '検査', '計量', '梱包'];
  i integer;
  target_order_no text;
  target_lot_no text;
  target_product_code text;
  target_product_name text;
  target_customer_name text;
  target_amount integer;
  target_post_id uuid;
  target_product_id uuid;
  target_process_id uuid;
  target_inventory_id uuid;
  process_name_value text;
  process_order_value integer;
  completed_values integer[];
  outsource_status_value text;
  demo_state_value text;
  inventory_stock_value integer := 0;
  allocated_amount_value integer := 0;
  shipped_amount_value integer := 0;
begin
  delete from shipments where order_no like 'DEMO-ORD-%';
  delete from inventory_allocations
   where post_id in (select id from posts where order_no like 'DEMO-ORD-%');
  delete from production_results
   where post_id in (select id from posts where order_no like 'DEMO-ORD-%');
  delete from production_schedules where order_no like 'DEMO-ORD-%';
  delete from order_processes
   where post_id in (select id from posts where order_no like 'DEMO-ORD-%');
  delete from posts where order_no like 'DEMO-ORD-%';
  delete from inventory_items
   where product_code like 'DEMO-P%'
      or lot_no like 'DEMO-LOT-%';
  delete from product_processes where product_code like 'DEMO-P%';
  delete from product_master where product_code like 'DEMO-P%';
  delete from subcontractors where name = 'デモメッキ協力会社';
  delete from customer_master where customer_name = 'デモ工業';

  insert into customer_master (
    customer_name,
    shipping_offset_days,
    note
  ) values (
    'デモ工業',
    2,
    '運用確認用デモ顧客'
  )
  on conflict do nothing;

  select id
    into demo_customer_id
    from customer_master
   where customer_name = 'デモ工業'
   order by id
   limit 1;

  insert into subcontractors (
    name,
    created_at,
    updated_at
  ) values (
    'デモメッキ協力会社',
    now(),
    now()
  )
  on conflict do nothing;

  select id
    into demo_subcontractor_id
    from subcontractors
   where name = 'デモメッキ協力会社'
   order by id
   limit 1;

  insert into process_master (
    process_id,
    name,
    days,
    sort,
    enabled,
    outsourcing
  )
  select *
  from (values
    ('demo-manufacturing', '製造', 1, 1, true, false),
    ('demo-plating', 'メッキ', 2, 2, true, true),
    ('demo-inspection', '検査', 1, 3, true, false),
    ('demo-measurement', '計量', 1, 4, true, false),
    ('demo-packaging', '梱包', 1, 5, true, false)
  ) as seed(process_id, name, days, sort, enabled, outsourcing)
  where not exists (
    select 1
      from process_master pm
     where pm.name = seed.name
  );

  for i in 1..10 loop
    target_order_no := 'DEMO-ORD-' || lpad(i::text, 3, '0');
    target_lot_no := 'DEMO-LOT-' || lpad(i::text, 3, '0');
    target_product_code := 'DEMO-P' || lpad(i::text, 3, '0');
    target_product_name := 'デモ製品' || lpad(i::text, 2, '0');
    target_customer_name := 'デモ工業';
    target_amount := 100 + (i * 50);
    inventory_stock_value := 0;
    allocated_amount_value := 0;
    shipped_amount_value := 0;

    delete from shipments where order_no = target_order_no;
    delete from inventory_allocations
     where post_id in (select id from posts where order_no = target_order_no);
    delete from production_results
     where post_id in (select id from posts where order_no = target_order_no);
    delete from production_schedules where order_no = target_order_no;
    delete from order_processes
     where post_id in (select id from posts where order_no = target_order_no);
    delete from posts where order_no = target_order_no;
    delete from inventory_items
     where product_code = target_product_code
       and lot_no like 'DEMO-%';
    delete from product_processes
     where product_code = target_product_code;
    delete from product_master
     where product_code = target_product_code;

    insert into product_master (
      product_code,
      product_name,
      customer_name,
      customer_id,
      standard,
      unit
    ) values (
      target_product_code,
      target_product_name,
      target_customer_name,
      demo_customer_id,
      '標準仕様-' || lpad(i::text, 2, '0'),
      '個'
    )
    on conflict do nothing;

    select id
      into target_product_id
      from product_master
     where product_code = target_product_code
     order by id
     limit 1;

    for process_order_value in 1..array_length(process_rows, 1) loop
      process_name_value := process_rows[process_order_value];

      insert into product_processes (
        product_id,
        product_code,
        process_name,
        process_order,
        process_master_id,
        subcontractor_id,
        created_at,
        updated_at
      )
      select
        target_product_id,
        target_product_code,
        process_name_value,
        process_order_value,
        pm.id,
        case when process_name_value = 'メッキ' then demo_subcontractor_id else null end,
        now(),
        now()
      from process_master pm
      where pm.name = process_name_value
      on conflict do nothing;
    end loop;

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
      remark,
      status,
      "delete",
      measurement_registration_hidden,
      created_at,
      updated_at
    ) values (
      target_order_no,
      case when i >= 6 then target_lot_no else '' end,
      target_product_code,
      target_product_name,
      target_product_id,
      target_customer_name,
      demo_customer_id,
      target_amount,
      current_date + (i - 3),
      current_date + (i + 2),
      '運用デモデータ: ケース' || i,
      '未着手',
      false,
      false,
      now(),
      now()
    )
    returning id into target_post_id;

    perform create_order_processes_for_post(target_post_id);

    completed_values := case i
      when 1 then array[0, 0, 0, 0, 0]
      when 2 then array[(target_amount / 2), 0, 0, 0, 0]
      when 3 then array[target_amount, 0, 0, 0, 0]
      when 4 then array[target_amount, target_amount, 0, 0, 0]
      when 5 then array[target_amount, target_amount, target_amount, 0, 0]
      when 6 then array[target_amount, target_amount, target_amount, (target_amount / 2), 0]
      when 7 then array[target_amount, target_amount, target_amount, target_amount, 0]
      when 8 then array[target_amount, target_amount, target_amount, target_amount, (target_amount / 2)]
      when 9 then array[target_amount, target_amount, target_amount, target_amount, target_amount]
      else array[target_amount, target_amount, target_amount, target_amount, target_amount]
    end;

    for process_order_value in 1..array_length(process_rows, 1) loop
      process_name_value := process_rows[process_order_value];
      select id
        into target_process_id
        from order_processes
       where post_id = target_post_id
         and process_order = process_order_value
       limit 1;

      if coalesce(completed_values[process_order_value], 0) > 0 then
        update order_processes
           set completed_amount = completed_values[process_order_value],
               completed_date = current_date - (6 - process_order_value),
               updated_at = now()
         where id = target_process_id;

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
          process_name_value,
          current_date - (6 - process_order_value),
          completed_values[process_order_value],
          now()
        );
      end if;
    end loop;

    if i in (3, 4) then
      outsource_status_value := case when i = 3 then 'sent' else 'returned' end;
      update order_processes
         set outsource_status = outsource_status_value,
             outsource_sent_date = current_date - 2,
             outsource_expected_return_date = current_date + 1,
             outsource_returned_date = case when i = 4 then current_date else null end,
             outsource_note = case
               when i = 3 then '外注先へ発送済み。返却待ち。'
               else '外注先から返却済み。検査待ち。'
             end,
             updated_at = now()
       where post_id = target_post_id
         and process_name = 'メッキ';
    end if;

    insert into production_schedules (
      post_id,
      product_id,
      customer_id,
      order_no,
      customer_name,
      product_name,
      press_number,
      lot_no,
      plan_amount,
      press_completed_amount,
      press_completed_date,
      shipping_scheduled_start,
      shipping_scheduled_end,
      created_at,
      updated_at
    ) values (
      target_post_id,
      target_product_id,
      demo_customer_id,
      target_order_no,
      target_customer_name,
      target_product_name,
      target_product_code,
      target_lot_no,
      target_amount,
      completed_values[1],
      case when completed_values[1] > 0 then current_date - 5 else null end,
      current_date + i,
      current_date + i + 2,
      now(),
      now()
    );

    if i = 9 then
      inventory_stock_value := target_amount;
      allocated_amount_value := target_amount;
      shipped_amount_value := 0;
    elsif i = 10 then
      inventory_stock_value := target_amount - 120;
      allocated_amount_value := target_amount - 120;
      shipped_amount_value := 120;
    elsif i = 8 then
      inventory_stock_value := target_amount / 2;
    elsif i = 2 then
      inventory_stock_value := 80;
    end if;

    if inventory_stock_value > 0 then
      insert into inventory_items (
        product_id,
        product_code,
        product_name,
        lot_no,
        current_stock,
        allocated_stock,
        updated_at
      ) values (
        target_product_id,
        target_product_code,
        target_product_name,
        target_lot_no,
        inventory_stock_value,
        allocated_amount_value,
        now()
      )
      returning id into target_inventory_id;
    end if;

    if allocated_amount_value > 0 then
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
        target_product_code,
        target_product_id,
        target_lot_no,
        allocated_amount_value + shipped_amount_value,
        shipped_amount_value,
        now()
      );
    end if;

    if shipped_amount_value > 0 then
      insert into shipments (
        post_id,
        order_no,
        customer_name,
        product_code,
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
        target_customer_name,
        target_product_code,
        target_product_name,
        target_product_id,
        demo_customer_id,
        target_lot_no,
        current_date,
        current_date + 2,
        target_amount,
        shipped_amount_value,
        now(),
        now()
      );
    end if;

    demo_state_value := case i
      when 1 then '生産開始前'
      when 2 then '製造中 + 既存在庫あり'
      when 3 then '外注メッキ発送済み'
      when 4 then '外注メッキ返却済み'
      when 5 then '検査完了・計量待ち'
      when 6 then '計量中'
      when 7 then '計量完了・梱包待ち'
      when 8 then '梱包中 + 未引当在庫あり'
      when 9 then '梱包完了 + 在庫引当済み・出荷前'
      else '一部出荷済み'
    end;

    insert into demo_seed_result (
      order_no,
      product_code,
      product_name,
      customer_name,
      order_amount,
      demo_state,
      inventory_stock,
      allocated_amount,
      shipped_amount,
      message
    ) values (
      target_order_no,
      target_product_code,
      target_product_name,
      target_customer_name,
      target_amount,
      demo_state_value,
      inventory_stock_value,
      allocated_amount_value,
      shipped_amount_value,
      'created'
    );
  end loop;
end $$;

select *
from demo_seed_result
order by order_no;
