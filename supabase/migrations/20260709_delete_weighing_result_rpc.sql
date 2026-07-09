-- Delete one weighing production_result through an RPC so the screen can remove
-- history rows even when RLS is enabled on production_results.

create or replace function delete_weighing_result(
  p_result_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_result production_results%rowtype;
  next_completed_amount integer;
  next_completed_date date;
begin
  select *
  into target_result
  from production_results
  where id = p_result_id
  for update;

  if not found then
    raise exception 'Weighing result was not found';
  end if;

  if coalesce(target_result.process_name, '') not like '%計量%' then
    raise exception 'Only weighing results can be deleted by this function';
  end if;

  delete from production_results
  where id = target_result.id;

  if target_result.order_process_id is not null then
    update order_processes
    set completed_amount = greatest(
          coalesce(completed_amount, 0) - coalesce(target_result.amount, 0),
          0
        ),
        updated_at = now()
    where id = target_result.order_process_id
    returning completed_amount into next_completed_amount;

    select max(date)
    into next_completed_date
    from production_results
    where order_process_id = target_result.order_process_id;

    update order_processes
    set completed_date = case
          when coalesce(next_completed_amount, 0) > 0 then next_completed_date
          else null
        end,
        updated_at = now()
    where id = target_result.order_process_id;
  end if;
end;
$$;

revoke all on function delete_weighing_result(uuid) from public;
grant execute on function delete_weighing_result(uuid) to anon, authenticated;
