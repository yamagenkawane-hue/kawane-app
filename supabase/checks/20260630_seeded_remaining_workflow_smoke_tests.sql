-- Self-contained smoke tests for the remaining workflow cases.
--
-- This script creates temporary test posts and order_processes inside a
-- transaction, verifies the behavior, and finishes with ROLLBACK.
--
-- Expected result:
-- - measurement_no_inventory: PASSED
-- - packaging_without_lot_error: PASSED

begin;

create temp table smoke_test_result (
  test_name text,
  result text,
  order_no text,
  order_process_id uuid,
  lot_no text,
  stock_before integer,
  stock_after integer,
  results_before integer,
  results_after integer,
  message text
) on commit drop;

do $$
declare
  run_key text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  measurement_post_id uuid;
  measurement_process_id uuid;
  packaging_post_id uuid;
  packaging_process_id uuid;
  measurement_order_no text := 'SMOKE-MEASURE-' || run_key;
  packaging_order_no text := 'SMOKE-PACK-NOLOT-' || run_key;
  measurement_product_code text := 'SMOKE-MEASURE-' || run_key;
  packaging_product_code text := 'SMOKE-PACK-' || run_key;
  measurement_lot_no text := 'LOT-SMOKE-' || run_key;
  before_stock integer := 0;
  after_stock integer := 0;
  before_results integer := 0;
  after_results integer := 0;
  error_message text := '';
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
    status
  ) values (
    measurement_order_no,
    measurement_lot_no,
    measurement_product_code,
    'スモークテスト 計量',
    'スモークテスト',
    5,
    current_date,
    current_date + 1,
    '未着手'
  )
  returning id into measurement_post_id;

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
    measurement_post_id,
    measurement_order_no,
    measurement_product_code,
    'スモークテスト 計量',
    'スモークテスト',
    '計量',
    1,
    5,
    0
  )
  returning id into measurement_process_id;

  select coalesce(sum(current_stock), 0)::integer
  into before_stock
  from inventory_items
  where product_code = measurement_product_code
    and lot_no = measurement_lot_no;

  select count(*)::integer
  into before_results
  from production_results
  where order_process_id = measurement_process_id;

  perform register_order_process_result(
    measurement_process_id,
    null,
    current_date,
    1
  );

  select coalesce(sum(current_stock), 0)::integer
  into after_stock
  from inventory_items
  where product_code = measurement_product_code
    and lot_no = measurement_lot_no;

  select count(*)::integer
  into after_results
  from production_results
  where order_process_id = measurement_process_id;

  insert into smoke_test_result (
    test_name,
    result,
    order_no,
    order_process_id,
    lot_no,
    stock_before,
    stock_after,
    results_before,
    results_after,
    message
  ) values (
    'measurement_no_inventory',
    case
      when after_results = before_results + 1
       and after_stock = before_stock
      then 'PASSED'
      else 'FAILED'
    end,
    measurement_order_no,
    measurement_process_id,
    measurement_lot_no,
    before_stock,
    after_stock,
    before_results,
    after_results,
    case
      when after_results = before_results + 1
       and after_stock = before_stock
      then '計量実績は登録され、在庫は増えませんでした'
      else '計量実績登録時の在庫更新状態が想定と異なります'
    end
  );

  insert into posts (
    order_no,
    lot_no,
    product_code,
    product_name,
    customer_name,
    order_amount,
    completion_scheduled_date,
    delivery_date,
    status
  ) values (
    packaging_order_no,
    '',
    packaging_product_code,
    'スモークテスト 梱包',
    'スモークテスト',
    5,
    current_date,
    current_date + 1,
    '未着手'
  )
  returning id into packaging_post_id;

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
    packaging_post_id,
    packaging_order_no,
    packaging_product_code,
    'スモークテスト 梱包',
    'スモークテスト',
    '梱包',
    1,
    5,
    0
  )
  returning id into packaging_process_id;

  select count(*)::integer
  into before_results
  from production_results
  where order_process_id = packaging_process_id;

  begin
    perform register_order_process_result(
      packaging_process_id,
      null,
      current_date,
      1
    );
  exception when others then
    error_message := sqlerrm;
  end;

  select count(*)::integer
  into after_results
  from production_results
  where order_process_id = packaging_process_id;

  insert into smoke_test_result (
    test_name,
    result,
    order_no,
    order_process_id,
    lot_no,
    stock_before,
    stock_after,
    results_before,
    results_after,
    message
  ) values (
    'packaging_without_lot_error',
    case
      when error_message like '%ロットNoが必要%'
       and after_results = before_results
      then 'PASSED'
      else 'FAILED'
    end,
    packaging_order_no,
    packaging_process_id,
    '',
    null,
    null,
    before_results,
    after_results,
    case
      when error_message = '' then 'エラーにならずに梱包実績登録が実行されました'
      else error_message
    end
  );
end;
$$;

select * from smoke_test_result order by test_name;

rollback;
