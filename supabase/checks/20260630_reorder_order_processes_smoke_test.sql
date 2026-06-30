-- Self-contained smoke test for drag-and-drop process reordering.
--
-- Run after applying:
-- supabase/migrations/20260630_reorder_order_processes.sql
--
-- Expected result:
-- - result = PASSED
-- - process_order is saved as the requested order
-- - register_order_process_result uses the new previous process after reorder
-- - v_posts_with_master.status follows the reordered latest completed process

begin;

create temp table smoke_test_result (
  result text,
  order_no text,
  order_names text,
  failed_amount integer,
  passed_amount integer,
  results_before integer,
  results_after integer,
  reordered_status text,
  message text
) on commit drop;

do $$
declare
  run_key text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  target_order_no text := 'SMOKE-REORDER-' || run_key;
  target_product_code text := 'SMOKE-REORDER-' || run_key;
  target_post_id uuid;
  first_process_id uuid;
  second_process_id uuid;
  third_process_id uuid;
  order_names text;
  before_results integer := 0;
  after_results integer := 0;
  status_after text := '';
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
    status,
    "delete"
  ) values (
    target_order_no,
    'LOT-' || run_key,
    target_product_code,
    'スモークテスト 工程順変更',
    'スモークテスト',
    5,
    current_date,
    current_date + 1,
    '未着手',
    false
  )
  returning id into target_post_id;

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
    'スモークテスト 工程順変更',
    'スモークテスト',
    '製造',
    1,
    5,
    5
  )
  returning id into first_process_id;

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
    'スモークテスト 工程順変更',
    'スモークテスト',
    '検査',
    2,
    5,
    0
  )
  returning id into second_process_id;

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
    'スモークテスト 工程順変更',
    'スモークテスト',
    '計量',
    3,
    5,
    0
  )
  returning id into third_process_id;

  perform reorder_order_processes(
    target_post_id,
    array[first_process_id, third_process_id, second_process_id]
  );

  select string_agg(process_name, ' > ' order by process_order)
  into order_names
  from order_processes
  where post_id = target_post_id;

  select count(*)::integer
  into before_results
  from production_results
  where post_id = target_post_id;

  begin
    perform register_order_process_result(
      second_process_id,
      null,
      current_date,
      1
    );
  exception when others then
    error_message := sqlerrm;
  end;

  perform register_order_process_result(
    third_process_id,
    null,
    current_date,
    2
  );

  perform register_order_process_result(
    second_process_id,
    null,
    current_date,
    2
  );

  select count(*)::integer
  into after_results
  from production_results
  where post_id = target_post_id;

  select status
  into status_after
  from v_posts_with_master
  where id = target_post_id;

  insert into smoke_test_result (
    result,
    order_no,
    order_names,
    failed_amount,
    passed_amount,
    results_before,
    results_after,
    reordered_status,
    message
  ) values (
    case
      when order_names = '製造 > 計量 > 検査'
       and error_message like '%Amount exceeds allowed quantity%'
       and after_results = before_results + 2
       and status_after = '検査中'
      then 'PASSED'
      else 'FAILED'
    end,
    target_order_no,
    order_names,
    1,
    2,
    before_results,
    after_results,
    status_after,
    case
      when error_message = '' then '並び替え後の前工程完了数を超える実績登録が拒否されませんでした'
      else error_message
    end
  );
end;
$$;

select * from smoke_test_result;

rollback;
