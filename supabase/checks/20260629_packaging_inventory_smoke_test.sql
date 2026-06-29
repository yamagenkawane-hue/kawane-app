-- Smoke test for packaging inventory registration.
--
-- This script writes inside a transaction and finishes with ROLLBACK, so it
-- does not leave test production_results or inventory changes in the database.
--
-- Expected result:
-- - result = PASSED
-- - stock_after = stock_before + 1
-- - results_after = results_before + 1

begin;

create temp table smoke_test_result (
  result text,
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
  target_process record;
  target_lot_no text;
  before_stock integer := 0;
  after_stock integer := 0;
  before_results integer := 0;
  after_results integer := 0;
begin
  select
    op.id,
    op.post_id,
    op.product_id,
    op.product_code,
    op.process_name,
    op.process_order,
    op.planned_amount,
    op.completed_amount,
    p.lot_no
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
    and nullif(trim(coalesce(p.lot_no, '')), '') is not null
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
      'ロットNoがあり、梱包/包装工程に残登録可能数がある対象データが見つかりませんでした'
    );
    return;
  end if;

  target_lot_no := nullif(trim(coalesce(target_process.lot_no, '')), '');

  select coalesce(sum(current_stock), 0)::integer
  into before_stock
  from inventory_items
  where lot_no = target_lot_no
    and (
      (target_process.product_id is not null and product_id = target_process.product_id)
      or product_code = target_process.product_code
    );

  select count(*)::integer
  into before_results
  from production_results
  where order_process_id = target_process.id;

  perform register_order_process_result(
    target_process.id,
    null,
    current_date,
    1
  );

  select coalesce(sum(current_stock), 0)::integer
  into after_stock
  from inventory_items
  where lot_no = target_lot_no
    and (
      (target_process.product_id is not null and product_id = target_process.product_id)
      or product_code = target_process.product_code
    );

  select count(*)::integer
  into after_results
  from production_results
  where order_process_id = target_process.id;

  insert into smoke_test_result (
    result,
    order_process_id,
    lot_no,
    stock_before,
    stock_after,
    results_before,
    results_after,
    message
  )
  values (
    case
      when after_results = before_results + 1
       and after_stock = before_stock + 1
      then 'PASSED'
      else 'FAILED'
    end,
    target_process.id,
    target_lot_no,
    before_stock,
    after_stock,
    before_results,
    after_results,
    case
      when after_results = before_results + 1
       and after_stock = before_stock + 1
      then '梱包実績登録で production_results と inventory_items が想定どおり更新されました。ROLLBACKするため変更は残りません'
      else '想定どおり更新されませんでした'
    end
  );
end;
$$;

select * from smoke_test_result;

rollback;
