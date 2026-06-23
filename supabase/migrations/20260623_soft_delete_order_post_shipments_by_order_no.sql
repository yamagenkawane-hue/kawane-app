-- Keep order deletion safe for migrated shipment rows that still have order_no
-- but do not have post_id populated.

create or replace function soft_delete_order_post(p_post_id uuid)
returns void as $$
declare
  v_post record;
begin
  select *
  into v_post
  from posts
  where id = p_post_id
  for update;

  if not found then
    raise exception '受注データが見つかりません';
  end if;

  update inventory_items ii
  set allocated_stock = greatest(
        coalesce(ii.allocated_stock, 0)
          - coalesce(allocation_totals.unshipped_amount, 0),
        0
      ),
      updated_at = now()
  from (
    select
      inventory_item_id,
      sum(greatest(allocated_amount - shipped_amount, 0)) as unshipped_amount
    from inventory_allocations
    where post_id = p_post_id
      and inventory_item_id is not null
    group by inventory_item_id
  ) allocation_totals
  where ii.id = allocation_totals.inventory_item_id;

  delete from inventory_allocations
  where post_id = p_post_id;

  delete from production_results pr
  where pr.post_id = p_post_id
     or pr.order_process_id in (
       select op.id
       from order_processes op
       where op.post_id = p_post_id
     )
     or pr.schedule_id in (
       select ps.id
       from production_schedules ps
       where ps.post_id = p_post_id
          or (
            ps.post_id is null
            and nullif(trim(ps.order_no), '') = v_post.order_no
          )
     );

  delete from production_schedules ps
  where ps.post_id = p_post_id
     or (
       ps.post_id is null
       and nullif(trim(ps.order_no), '') = v_post.order_no
     );

  delete from order_processes
  where post_id = p_post_id;

  delete from shipments s
  where s.post_id = p_post_id
     or (
       s.post_id is null
       and nullif(trim(s.order_no), '') = v_post.order_no
     );

  update posts
  set "delete" = true,
      updated_at = now()
  where id = p_post_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function soft_delete_order_post(uuid) to anon, authenticated;