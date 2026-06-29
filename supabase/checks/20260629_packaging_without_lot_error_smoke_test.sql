-- Smoke test for packaging registration without lot_no.
--
-- This script writes inside a transaction and finishes with ROLLBACK.
--
-- Expected result:
-- - result = PASSED
-- - message includes the expected lot number error
-- - results_after = results_before

begin;

create temp table smoke_test_result (
  result text,
  order_process_id uuid,
  order_no text,
  results_before integer,
  results_after integer,
  message text
) on commit drop;

do $$
declare
  target_process record;
  before_results integer := 0;
  after_results integer := 0;
  error_message text := '';
begin
  select
    op.id,
    op.post_id,
    op.product_code,
    op.process_name,
    op.process_order,
    op.planned_amount,
    op.completed_amount,
    p.order_no
  into target_process
  from order_processes op
  join posts p on p.id = op.post_id
  left join lateral (
    select completed_amount
    from order_processes
    where post_id = op.post_id
      and process_order < op.process_order
    order by process_order desc
    limit 1
  ) prev on true
  where (op.process_name like '%梱包%' or op.process_name like '%包装%')
    and nullif(trim(coalesce(p.lot_no, '')), '') is null
    and greatest(
      (
        case
          when op.process_order = 1 then coalesce(op.planned_amount, 0)
          else coalesce(prev.completed_amount, 0)
        end
      ) - coalesce(op.completed_amount, 0),
      0
    ) >= 1
  order by op.updated_at desc nulls last, op.created_at desc nulls last
  limit 1;

  if target_process.id is null then
    insert into smoke_test_result (result, message)
    values (
      'SKIPPED',
      'ロットNoが空で、梱包/包装工程に残登録可能数がある対象データが見つかりませんでした'
    );
    return;
  end if;

  select count(*)::integer
  into before_results
  from production_results
  where order_process_id = target_process.id;

  begin
    perform register_order_process_result(
      target_process.id,
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
  where order_process_id = target_process.id;

  insert into smoke_test_result (
    result,
    order_process_id,
    order_no,
    results_before,
    results_after,
    message
  )
  values (
    case
      when error_message like '%ロットNoが必要%'
       and after_results = before_results
      then 'PASSED'
      else 'FAILED'
    end,
    target_process.id,
    target_process.order_no,
    before_results,
    after_results,
    case
      when error_message = '' then 'エラーにならずに梱包実績登録が実行されました'
      else error_message
    end
  );
end;
$$;

select * from smoke_test_result;

rollback;
