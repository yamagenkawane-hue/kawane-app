-- Save drag-and-drop process order atomically so progress/result logic always
-- sees a complete, gapless process_order sequence.

create or replace function reorder_order_processes(
  p_post_id uuid,
  p_order_process_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer := 0;
  provided_count integer := coalesce(array_length(p_order_process_ids, 1), 0);
  distinct_count integer := 0;
  temp_base integer := 100000;
begin
  if provided_count = 0 then
    raise exception '工程順を保存する対象がありません';
  end if;

  select count(*)::integer
  into distinct_count
  from (
    select distinct process_id
    from unnest(p_order_process_ids) as ids(process_id)
  ) ids;

  if distinct_count <> provided_count then
    raise exception '工程順に重複した工程IDがあります';
  end if;

  perform 1
  from order_processes
  where post_id = p_post_id
  for update;

  select count(*)::integer
  into expected_count
  from order_processes
  where post_id = p_post_id;

  if expected_count <> provided_count then
    raise exception '受注別工程の件数が一致しません';
  end if;

  if exists (
    select 1
    from unnest(p_order_process_ids) as ids(process_id)
    left join order_processes op
      on op.id = process_id
     and op.post_id = p_post_id
    where op.id is null
  ) then
    raise exception '別受注の工程、または存在しない工程が含まれています';
  end if;

  update order_processes op
  set process_order = temp_base + array_position(p_order_process_ids, op.id),
      product_process_id = null,
      updated_at = now()
  where op.post_id = p_post_id;

  update order_processes op
  set process_order = array_position(p_order_process_ids, op.id),
      updated_at = now()
  where op.post_id = p_post_id;
end;
$$;

revoke all on function reorder_order_processes(uuid, uuid[]) from public;
grant execute on function reorder_order_processes(uuid, uuid[]) to anon, authenticated;
