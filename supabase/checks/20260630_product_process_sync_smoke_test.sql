-- Self-contained smoke test for syncing order_processes from product_processes.
--
-- Run after applying:
-- supabase/migrations/20260630_sync_order_processes_from_product_master.sql
--
-- Expected result:
-- - result = PASSED
-- - incomplete existing process is updated from the master
-- - completed existing process is skipped
-- - missing master process is inserted

begin;

create temp table smoke_test_result (
  result text,
  order_no text,
  inserted_count integer,
  updated_count integer,
  skipped_count integer,
  order1_name text,
  order2_name text,
  order3_name text,
  order1_master_linked boolean,
  order2_completed_kept boolean,
  order3_inserted boolean,
  message text
) on commit drop;

do $$
declare
  run_key text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  target_order_no text := 'SMOKE-PP-SYNC-' || run_key;
  target_product_code text := 'SMOKE-PP-' || run_key;
  target_post_id uuid;
  master_one_id uuid;
  master_two_id uuid;
  master_three_id uuid;
  sync_result record;
  order1 record;
  order2 record;
  order3 record;
begin
  insert into product_processes (
    product_code,
    process_name,
    process_order,
    created_at,
    updated_at
  ) values
  (target_product_code, 'マスタ製造', 1, now(), now()),
  (target_product_code, 'マスタ検査', 2, now(), now()),
  (target_product_code, 'マスタ計量', 3, now(), now());

  select id into master_one_id
  from product_processes
  where product_code = target_product_code and process_order = 1;

  select id into master_two_id
  from product_processes
  where product_code = target_product_code and process_order = 2;

  select id into master_three_id
  from product_processes
  where product_code = target_product_code and process_order = 3;

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
    'スモークテスト 工程マスタ同期',
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
    completed_amount,
    locked
  ) values
  (
    target_post_id,
    target_order_no,
    target_product_code,
    'スモークテスト 工程マスタ同期',
    'スモークテスト',
    '旧製造',
    1,
    1,
    0,
    false
  ),
  (
    target_post_id,
    target_order_no,
    target_product_code,
    'スモークテスト 工程マスタ同期',
    'スモークテスト',
    '完了済み検査',
    2,
    5,
    2,
    false
  );

  select *
  into sync_result
  from sync_order_processes_from_product_master(target_post_id);

  select *
  into order1
  from order_processes
  where post_id = target_post_id and process_order = 1;

  select *
  into order2
  from order_processes
  where post_id = target_post_id and process_order = 2;

  select *
  into order3
  from order_processes
  where post_id = target_post_id and process_order = 3;

  insert into smoke_test_result (
    result,
    order_no,
    inserted_count,
    updated_count,
    skipped_count,
    order1_name,
    order2_name,
    order3_name,
    order1_master_linked,
    order2_completed_kept,
    order3_inserted,
    message
  ) values (
    case
      when sync_result.inserted_count = 1
       and sync_result.updated_count = 1
       and sync_result.skipped_count = 1
       and order1.process_name = 'マスタ製造'
       and order1.product_process_id = master_one_id
       and order1.planned_amount = 5
       and order2.process_name = '完了済み検査'
       and order2.completed_amount = 2
       and order3.process_name = 'マスタ計量'
       and order3.product_process_id = master_three_id
      then 'PASSED'
      else 'FAILED'
    end,
    target_order_no,
    sync_result.inserted_count,
    sync_result.updated_count,
    sync_result.skipped_count,
    order1.process_name,
    order2.process_name,
    order3.process_name,
    order1.product_process_id = master_one_id,
    order2.process_name = '完了済み検査' and order2.completed_amount = 2,
    order3.product_process_id = master_three_id,
    '未完了工程は更新、完了済み工程は保持、未作成工程は追加されることを確認'
  );
end;
$$;

select * from smoke_test_result;

rollback;
