-- Centralize syncing order_processes from product_processes so the screen and
-- DB checks use the same behavior.

create or replace function sync_order_processes_from_product_master(
  p_post_id uuid
) returns table (
  inserted_count integer,
  updated_count integer,
  skipped_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post posts%rowtype;
  master_process record;
  existing_process order_processes%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  select *
  into target_post
  from posts
  where id = p_post_id
  for update;

  if not found then
    raise exception '受注データが見つかりません';
  end if;

  if not exists (
    select 1
    from product_processes pp
    where (
      (target_post.product_id is not null and pp.product_id = target_post.product_id)
      or pp.product_code = target_post.product_code
    )
  ) then
    raise exception 'この製品の製品工程マスタが登録されていません';
  end if;

  for master_process in
    select distinct on (pp.process_order)
      pp.id,
      pp.product_id,
      pp.product_code,
      pp.process_name,
      pp.process_order,
      pp.subcontractor_id
    from product_processes pp
    where (
      (target_post.product_id is not null and pp.product_id = target_post.product_id)
      or pp.product_code = target_post.product_code
    )
    order by pp.process_order, pp.updated_at desc nulls last, pp.created_at desc nulls last
  loop
    select *
    into existing_process
    from order_processes op
    where op.post_id = p_post_id
      and op.process_order = master_process.process_order
    limit 1
    for update;

    if not found then
      insert into order_processes (
        post_id,
        order_no,
        product_id,
        customer_id,
        product_process_id,
        product_code,
        product_name,
        customer_name,
        process_name,
        process_order,
        planned_amount,
        subcontractor_id,
        completed_amount,
        locked
      ) values (
        target_post.id,
        target_post.order_no,
        coalesce(target_post.product_id, master_process.product_id),
        target_post.customer_id,
        master_process.id,
        coalesce(target_post.product_code, master_process.product_code),
        target_post.product_name,
        target_post.customer_name,
        master_process.process_name,
        master_process.process_order,
        coalesce(target_post.order_amount, 0),
        master_process.subcontractor_id,
        0,
        false
      );

      v_inserted := v_inserted + 1;
      continue;
    end if;

    if coalesce(existing_process.completed_amount, 0) > 0
       or coalesce(existing_process.locked, false) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update order_processes
    set product_process_id = master_process.id,
        process_name = master_process.process_name,
        planned_amount = coalesce(target_post.order_amount, 0),
        subcontractor_id = master_process.subcontractor_id,
        updated_at = now()
    where id = existing_process.id;

    v_updated := v_updated + 1;
  end loop;

  inserted_count := v_inserted;
  updated_count := v_updated;
  skipped_count := v_skipped;
  return next;
end;
$$;

revoke all on function sync_order_processes_from_product_master(uuid) from public;
grant execute on function sync_order_processes_from_product_master(uuid) to anon, authenticated;
