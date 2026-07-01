-- Clean up legacy workflow rows for posts that were already soft-deleted
-- before soft_delete_order_post removed all related workflow data.
--
-- This reuses soft_delete_order_post so inventory allocation rollback and
-- related-row deletion stay consistent with the current UI deletion behavior.

do $$
declare
  target_post record;
begin
  for target_post in
    select p.id
    from posts p
    where coalesce(p."delete", false) = true
      and (
        exists (
          select 1
          from order_processes op
          where op.post_id = p.id
        )
        or exists (
          select 1
          from production_results pr
          where pr.post_id = p.id
             or pr.order_process_id in (
               select op.id
               from order_processes op
               where op.post_id = p.id
             )
        )
        or exists (
          select 1
          from production_schedules ps
          where ps.post_id = p.id
             or (
               ps.post_id is null
               and nullif(trim(coalesce(ps.order_no, '')), '') = p.order_no
             )
        )
        or exists (
          select 1
          from shipments s
          where s.post_id = p.id
             or (
               s.post_id is null
               and nullif(trim(coalesce(s.order_no, '')), '') = p.order_no
             )
        )
        or exists (
          select 1
          from inventory_allocations ia
          where ia.post_id = p.id
        )
      )
    order by p.updated_at nulls first, p.created_at nulls first, p.id
  loop
    perform soft_delete_order_post(target_post.id);
  end loop;
end;
$$;
