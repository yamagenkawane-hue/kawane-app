-- Self-contained smoke test for process allowance validation.
--
-- This script creates a temporary order with two normal in-house processes,
-- attempts to register a result that exceeds the previous process completion,
-- verifies that it fails without writing a result, and finishes with ROLLBACK.
--
-- Expected result:
-- - result = PASSED
-- - results_after = results_before
-- - next_completed_after = next_completed_before

begin;

create temp table smoke_test_result (
  result text,
  order_no text,
  previous_order_process_id uuid,
  next_order_process_id uuid,
  previous_completed integer,
  attempted_amount integer,
  results_before integer,
  results_after integer,
  next_completed_before integer,
  next_completed_after integer,
  message text
) on commit drop;

do $$
declare
  run_key text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  target_order_no text := 'SMOKE-ALLOWANCE-' || run_key;
  target_product_code text := 'SMOKE-ALLOWANCE-' || run_key;
  target_post_id uuid;
  previous_process_id uuid;
  next_process_id uuid;
  previous_completed integer := 2;
  attempted_amount integer := 3;
  before_results integer := 0;
  after_results integer := 0;
  before_completed integer := 0;
  after_completed integer := 0;
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
    'スモークテスト 工程上限',
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
    'スモークテスト 工程上限',
    'スモークテスト',
    '製造',
    1,
    5,
    previous_completed
  )
  returning id into previous_process_id;

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
    'スモークテスト 工程上限',
    'スモークテスト',
    '洗浄',
    2,
    5,
    0
  )
  returning id into next_process_id;

  select count(*)::integer
  into before_results
  from production_results
  where order_process_id = next_process_id;

  select completed_amount
  into before_completed
  from order_processes
  where id = next_process_id;

  begin
    perform register_order_process_result(
      next_process_id,
      null,
      current_date,
      attempted_amount
    );
  exception when others then
    error_message := sqlerrm;
  end;

  select count(*)::integer
  into after_results
  from production_results
  where order_process_id = next_process_id;

  select completed_amount
  into after_completed
  from order_processes
  where id = next_process_id;

  insert into smoke_test_result (
    result,
    order_no,
    previous_order_process_id,
    next_order_process_id,
    previous_completed,
    attempted_amount,
    results_before,
    results_after,
    next_completed_before,
    next_completed_after,
    message
  ) values (
    case
      when error_message like '%Amount exceeds allowed quantity%'
       and after_results = before_results
       and after_completed = before_completed
      then 'PASSED'
      else 'FAILED'
    end,
    target_order_no,
    previous_process_id,
    next_process_id,
    previous_completed,
    attempted_amount,
    before_results,
    after_results,
    before_completed,
    after_completed,
    case
      when error_message = '' then 'エラーにならずに前工程完了数を超える実績登録が実行されました'
      else error_message
    end
  );
end;
$$;

select * from smoke_test_result;

rollback;
