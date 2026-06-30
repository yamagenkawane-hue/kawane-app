-- Self-contained smoke test for v_posts_with_master derived statuses.
--
-- Run after applying:
-- supabase/migrations/20260630_restore_posts_view_derived_status.sql
--
-- Expected result:
-- - all rows return result = PASSED

begin;

create temp table smoke_test_result (
  check_name text,
  result text,
  order_no text,
  expected_status text,
  actual_status text,
  message text
) on commit drop;

do $$
declare
  run_key text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  sent_post_id uuid;
  returned_post_id uuid;
  inspection_post_id uuid;
  measurement_post_id uuid;
  sent_order_no text := 'SMOKE-STATUS-SENT-' || run_key;
  returned_order_no text := 'SMOKE-STATUS-RETURNED-' || run_key;
  inspection_order_no text := 'SMOKE-STATUS-INSPECTION-' || run_key;
  measurement_order_no text := 'SMOKE-STATUS-MEASURE-' || run_key;
  sent_status text;
  returned_status text;
  inspection_status text;
  measurement_status text;
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
  ) values
  (sent_order_no, 'LOT-' || run_key, 'SMOKE-STATUS', '状態テスト 外注中', 'スモークテスト', 5, current_date, current_date + 1, '未着手', false),
  (returned_order_no, 'LOT-' || run_key, 'SMOKE-STATUS', '状態テスト 外注済', 'スモークテスト', 5, current_date, current_date + 1, '未着手', false),
  (inspection_order_no, 'LOT-' || run_key, 'SMOKE-STATUS', '状態テスト 検査完了', 'スモークテスト', 5, current_date, current_date + 1, '未着手', false),
  (measurement_order_no, 'LOT-' || run_key, 'SMOKE-STATUS', '状態テスト 計量中', 'スモークテスト', 5, current_date, current_date + 1, '未着手', false);

  select id into sent_post_id from posts where order_no = sent_order_no;
  select id into returned_post_id from posts where order_no = returned_order_no;
  select id into inspection_post_id from posts where order_no = inspection_order_no;
  select id into measurement_post_id from posts where order_no = measurement_order_no;

  insert into order_processes (
    post_id,
    order_no,
    product_code,
    product_name,
    customer_name,
    process_name,
    process_order,
    planned_amount,
    completed_amount,
    outsource_sent_date,
    outsource_status
  ) values (
    sent_post_id,
    sent_order_no,
    'SMOKE-STATUS',
    '状態テスト 外注中',
    'スモークテスト',
    '外注仕上げ',
    2,
    5,
    0,
    current_date,
    'sent'
  );

  insert into order_processes (
    post_id,
    order_no,
    product_code,
    product_name,
    customer_name,
    process_name,
    process_order,
    planned_amount,
    completed_amount,
    outsource_sent_date,
    outsource_returned_date,
    outsource_status
  ) values (
    returned_post_id,
    returned_order_no,
    'SMOKE-STATUS',
    '状態テスト 外注済',
    'スモークテスト',
    '外注仕上げ',
    2,
    5,
    5,
    current_date,
    current_date,
    'returned'
  );

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
    inspection_post_id,
    inspection_order_no,
    'SMOKE-STATUS',
    '状態テスト 検査完了',
    'スモークテスト',
    '検査',
    3,
    5,
    5
  );

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
    'SMOKE-STATUS',
    '状態テスト 計量中',
    'スモークテスト',
    '計量',
    4,
    5,
    2
  );

  select status into sent_status from v_posts_with_master where id = sent_post_id;
  select status into returned_status from v_posts_with_master where id = returned_post_id;
  select status into inspection_status from v_posts_with_master where id = inspection_post_id;
  select status into measurement_status from v_posts_with_master where id = measurement_post_id;

  insert into smoke_test_result values
    (
      'outsource_sent_status',
      case when sent_status = '外注' then 'PASSED' else 'FAILED' end,
      sent_order_no,
      '外注',
      sent_status,
      '外注送付済みの受注は外注として表示される'
    ),
    (
      'outsource_returned_status',
      case when returned_status = '外注済' then 'PASSED' else 'FAILED' end,
      returned_order_no,
      '外注済',
      returned_status,
      '外注返却済みの受注は外注済として表示される'
    ),
    (
      'inspection_completed_status',
      case when inspection_status = '検査完了' then 'PASSED' else 'FAILED' end,
      inspection_order_no,
      '検査完了',
      inspection_status,
      '検査工程が予定数まで完了した受注は検査完了として表示される'
    ),
    (
      'measurement_in_progress_status',
      case when measurement_status = '計量中' then 'PASSED' else 'FAILED' end,
      measurement_order_no,
      '計量中',
      measurement_status,
      '計量工程が一部完了した受注は計量中として表示される'
    );
end;
$$;

select * from smoke_test_result order by check_name;

rollback;
