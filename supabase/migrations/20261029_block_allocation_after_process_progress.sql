begin;

-- A plan is not progress. Any actual work or transfer blocks NEW allocations.
-- Product-wide stock and other orders' progress must not affect this order.
create or replace function public.order_has_process_progress(p_post_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from order_processes op where op.post_id=p_post_id and
    (coalesce(op.completed_amount,0)>0 or op.outsource_sent_date is not null
      or op.outsource_returned_date is not null or op.outsource_status in ('sent','returned')))
    or exists(select 1 from production_results pr where pr.amount>0 and
      (pr.post_id=p_post_id or pr.order_process_id in(select id from order_processes where post_id=p_post_id)
        or pr.schedule_id in(select ps.id from production_schedules ps join posts p on p.id=p_post_id
          where ps.post_id=p_post_id or (ps.post_id is null and ps.order_no=p.order_no))))
    or exists(select 1 from process_transfer_history h where h.post_id=p_post_id and h.quantity>0
      and h.movement_type in ('manufacturing_result','process_transfer','quantity_correction','stock_in'))
    or exists(select 1 from lot_process_balance b join order_processes op on op.id=b.order_process_id
      where b.post_id=p_post_id and b.quantity>0 and
        op.process_order>(select min(first_op.process_order) from order_processes first_op where first_op.post_id=p_post_id));
$$;
revoke all on function public.order_has_process_progress(uuid) from public;
grant execute on function public.order_has_process_progress(uuid) to anon,authenticated,service_role;

create or replace view public.v_order_allocation_eligibility as
select p.id as post_id,public.order_has_process_progress(p.id) as has_process_progress from public.posts p;
grant select on public.v_order_allocation_eligibility to anon,authenticated,service_role;

-- Preserve the existing allocation implementation, but make it callable only by the wrapper's owner.
do $$ begin
  if to_regprocedure('public.confirm_inventory_allocation_unstarted_base(uuid)') is null then
    alter function public.confirm_inventory_allocation(uuid) rename to confirm_inventory_allocation_unstarted_base;
  end if;
end $$;
revoke all on function public.confirm_inventory_allocation_unstarted_base(uuid) from public,anon,authenticated,service_role;

create or replace function public.confirm_inventory_allocation(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  -- Serialize with production/result registrations that lock the same order.
  perform 1 from posts where id=p_post_id and "delete" is not true for update;
  if not found then raise exception '有効な注番が見つかりません'; end if;
  if public.order_has_process_progress(p_post_id) then
    raise exception '工程進捗があるため在庫引当できません。未着手の受注のみ引当できます。';
  end if;
  perform public.confirm_inventory_allocation_unstarted_base(p_post_id);
end $$;
revoke all on function public.confirm_inventory_allocation(uuid) from public;
grant execute on function public.confirm_inventory_allocation(uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
