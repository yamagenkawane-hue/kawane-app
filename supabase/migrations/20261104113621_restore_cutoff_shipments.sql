begin;
alter table public.order_shipment_closures
  add column restored_shipment_quantity bigint not null default 0 check(restored_shipment_quantity>=0),
  add column restored_shipment_ids jsonb not null default '[]'::jsonb;
create or replace function public.restore_order_shipments(p_closure_id uuid,p_request_id uuid)
returns public.order_shipment_closures language plpgsql security definer set search_path='' as $$
declare
  v_post_id uuid;
  v_post public.posts%rowtype;
  v_log public.order_shipment_closures%rowtype;
  v_replay public.order_shipment_closures%rowtype;
  v_actor text;
  v_shipped bigint;
  v_shipment public.shipments%rowtype;
  v_movement jsonb;
  v_allocation jsonb;
  v_restored bigint:=0;
  v_ids jsonb:='[]'::jsonb;
  v_expected bigint;
  v_actual bigint;
begin
  perform app_private.assert_access(false);
  select login_id into v_actor from public.app_profiles where id=auth.uid() and active;
  if v_actor is null then raise exception 'ログイン状態を確認してください' using errcode='42501'; end if;
  if p_closure_id is null or p_request_id is null then raise exception '打ち切り履歴と処理キーを指定してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended('restore:'||p_request_id::text,0));
  select * into v_replay from public.order_shipment_closures where restore_request_id=p_request_id;
  if found then
    if v_replay.id<>p_closure_id or v_replay.restored_actor_id<>auth.uid() then raise exception '同じ処理キーで異なる復元は登録できません'; end if;
    return v_replay;
  end if;
  select post_id into v_post_id from public.order_shipment_closures where id=p_closure_id;
  if not found then raise exception '打ち切り履歴が見つかりません'; end if;
  select * into v_post from public.posts where id=v_post_id for update;
  if not found or v_post."delete" is true then raise exception '有効な注番が見つかりません'; end if;
  select * into v_log from public.order_shipment_closures where id=p_closure_id for update;
  if v_log.restored_at is not null then raise exception 'この打ち切りはすでに復元済みです'; end if;
  if v_post.shipment_closed_at is distinct from v_log.closed_at then raise exception '現在の打ち切り状態と一致しません。履歴を再読込してください'; end if;
  select coalesce(sum(quantity),0) into v_shipped from public.shipments
    where (post_id=v_post_id or (post_id is null and order_no=v_post.order_no)) and cancelled is not true;
  if coalesce(v_post.order_amount,0)<=v_shipped then raise exception '注残がないため復元できません'; end if;
  update public.order_shipment_closures set restored_at=now(),restored_actor_id=auth.uid(),restored_actor_name=v_actor,restore_request_id=p_request_id
    where id=p_closure_id returning * into v_log;
  -- Clear completion inside this transaction so shipment-cancellation guards permit the scoped reversal.
  update public.posts set shipment_closed_at=null,updated_at=now() where id=v_post_id;
  select (result->>'shipped_quantity')::bigint into v_expected
    from app_private.shipment_cutoff_requests
    where id=v_log.id and post_id=v_post_id and result->>'closure_id'=v_log.id::text;
  if found then
    select coalesce(sum(quantity),0) into v_actual from public.shipments
      where post_id=v_post_id and idempotency_key='cutoff:'||v_log.id::text||':'||lot_id::text;
    if v_actual<>v_expected then raise exception '打ち切り時の出荷履歴が一致しません。管理者に確認してください'; end if;
    for v_shipment in select * from public.shipments
      where post_id=v_post_id and idempotency_key='cutoff:'||v_log.id::text||':'||lot_id::text
        and cancelled is not true order by lot_id,id for update loop
      if v_shipment.inventory_movements is null or jsonb_typeof(v_shipment.inventory_movements)<>'array' then
        raise exception '元の在庫移動明細がないため復元できません';
      end if;
      if (select coalesce(sum((value->>'quantity')::bigint),0) from jsonb_array_elements(v_shipment.inventory_movements))<>v_shipment.quantity then
        raise exception '元の在庫移動数量が一致しないため復元できません';
      end if;
      perform 1 from public.lots where id=v_shipment.lot_id and deleted is not true for update;
      if not found then raise exception '元のロットがないため復元できません'; end if;
      for v_movement in select value from jsonb_array_elements(v_shipment.inventory_movements) loop
        update public.inventory_items set current_stock=current_stock+(v_movement->>'quantity')::integer,
          allocated_stock=coalesce(allocated_stock,0)+(v_movement->>'allocated')::integer,updated_at=now()
          where id=(v_movement->>'inventory_id')::uuid and lot_id=v_shipment.lot_id;
        if not found then raise exception '元の在庫レコードがないため復元できません'; end if;
        for v_allocation in select value from jsonb_array_elements(v_movement->'allocations') loop
          update public.inventory_allocations set shipped_amount=shipped_amount-(v_allocation->>'quantity')::integer
            where id=(v_allocation->>'id')::uuid and post_id=v_post_id
              and inventory_item_id=(v_movement->>'inventory_id')::uuid and shipped_amount>=(v_allocation->>'quantity')::integer;
          if not found then raise exception '元の引当レコードを復元できません'; end if;
        end loop;
      end loop;
      update public.shipments set cancelled=true,cancelled_at=now(),cancelled_reason='打ち切り復元（履歴ID：'||v_log.id::text||'）',updated_at=now()
        where id=v_shipment.id;
      update public.lots set inventory_amount=(select coalesce(sum(current_stock),0) from public.inventory_items where lot_id=v_shipment.lot_id),
        allocated_amount=(select coalesce(sum(allocated_stock),0) from public.inventory_items where lot_id=v_shipment.lot_id),
        shipped_amount=greatest(coalesce(shipped_amount,0)-v_shipment.quantity,0),
        last_shipped_at=(select max(scheduled_date) from public.shipments where lot_id=v_shipment.lot_id and cancelled is not true),updated_at=now()
        where id=v_shipment.lot_id;
      v_restored:=v_restored+v_shipment.quantity;
      v_ids:=v_ids||to_jsonb(v_shipment.id);
    end loop;
  elsif exists(select 1 from public.shipments where post_id=v_post_id and idempotency_key='cutoff:'||v_log.id::text||':'||lot_id::text) then
    raise exception '打ち切り時の処理記録がないため復元できません';
  end if;
  update public.order_shipment_closures set restored_shipment_quantity=v_restored,restored_shipment_ids=v_ids
    where id=p_closure_id returning * into v_log;
  return v_log;
end $$;
revoke all on function public.restore_order_shipments(uuid,uuid) from public,anon;
grant execute on function public.restore_order_shipments(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
