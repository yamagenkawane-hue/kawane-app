begin;
alter table public.order_shipment_closures
  add column restored_at timestamptz,
  add column restored_actor_id uuid,
  add column restored_actor_name text,
  add column restore_request_id uuid unique,
  add constraint closure_restore_complete check (
    (restored_at is null and restored_actor_id is null and restored_actor_name is null and restore_request_id is null)
    or (restored_at is not null and restored_actor_id is not null and restored_actor_name is not null and restore_request_id is not null)
  );
alter table public.order_shipment_closures drop constraint order_shipment_closures_post_id_key;
create unique index order_shipment_closures_active_post_idx on public.order_shipment_closures(post_id) where restored_at is null;

create or replace function public.guard_shipment_closure() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.shipment_closed_at is not null then raise exception '打ち切り状態を指定して受注を登録できません'; end if;
    return new;
  end if;
  if new.shipment_closed_at is distinct from old.shipment_closed_at then
    if new.shipment_closed_at is null then
      if exists(select 1 from public.order_shipment_closures where post_id=new.id and restored_at is null)
        or not exists(select 1 from public.order_shipment_closures where post_id=new.id and closed_at=old.shipment_closed_at and restored_at is not null) then
        raise exception '打ち切り状態は専用の復元処理でのみ解除できます';
      end if;
    elsif old.shipment_closed_at is not null or not exists(select 1 from public.order_shipment_closures where post_id=new.id and closed_at=new.shipment_closed_at and restored_at is null) then
      raise exception '打ち切り状態は専用の打ち切り処理でのみ変更できます';
    end if;
  end if;
  return new;
end $$;

create function public.restore_order_shipments(p_closure_id uuid,p_request_id uuid)
returns public.order_shipment_closures language plpgsql security definer set search_path='' as $$
declare
  v_post_id uuid;
  v_post public.posts%rowtype;
  v_log public.order_shipment_closures%rowtype;
  v_replay public.order_shipment_closures%rowtype;
  v_actor text;
  v_shipped bigint;
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
  -- Stock and allocations may have been used by another order since closure; never reclaim them automatically.
  update public.posts set shipment_closed_at=null,updated_at=now() where id=v_post_id;
  return v_log;
end $$;
revoke all on function public.restore_order_shipments(uuid,uuid) from public,anon;
grant execute on function public.restore_order_shipments(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
