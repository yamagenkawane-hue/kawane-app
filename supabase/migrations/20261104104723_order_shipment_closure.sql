begin;
alter table public.posts add column shipment_closed_at timestamptz;
create table public.order_shipment_closures (
  id uuid primary key,
  post_id uuid not null unique references public.posts(id) on delete restrict,
  order_no text not null,
  customer_name text not null,
  product_name text not null,
  order_amount bigint not null,
  shipped_amount bigint not null,
  closed_quantity bigint not null check (closed_quantity > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_id uuid not null,
  actor_name text not null,
  closed_at timestamptz not null default now(),
  released_allocations jsonb not null default '[]'::jsonb
);
create index order_shipment_closures_date_idx on public.order_shipment_closures(closed_at desc,id);
alter table public.order_shipment_closures enable row level security;
revoke all on public.order_shipment_closures from public,anon,authenticated;
grant select on public.order_shipment_closures to authenticated,service_role;
create policy closure_member_read on public.order_shipment_closures for select to authenticated
using ((select app_private.is_member(false)));

create function public.close_order_shipments(p_post_id uuid,p_reason text,p_request_id uuid)
returns public.order_shipment_closures language plpgsql security definer set search_path='' as $$
declare
  v_post public.posts%rowtype;
  v_log public.order_shipment_closures%rowtype;
  v_shipped bigint;
  v_actor text;
  v_item public.inventory_items%rowtype;
  v_allocation public.inventory_allocations%rowtype;
  v_lot public.lots%rowtype;
  v_release integer;
  v_total integer;
  v_released jsonb := '[]'::jsonb;
begin
  perform app_private.assert_access(false);
  select login_id into v_actor from public.app_profiles where id=auth.uid() and active;
  if v_actor is null then raise exception 'ログイン状態を確認してください' using errcode='42501'; end if;
  if p_post_id is null or p_request_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception '注番・打ち切り理由（500文字以内）・処理キーを確認してください';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_log from public.order_shipment_closures where id=p_request_id;
  if found then
    if v_log.post_id<>p_post_id or v_log.reason<>btrim(p_reason) or v_log.actor_id<>auth.uid() then
      raise exception '同じ処理キーで異なる打ち切りは登録できません';
    end if;
    return v_log;
  end if;
  select * into v_post from public.posts where id=p_post_id for update;
  if not found or v_post."delete" is true then raise exception '有効な注番が見つかりません'; end if;
  if v_post.shipment_closed_at is not null then raise exception 'この注番はすでに打ち切り済みです'; end if;
  select coalesce(sum(quantity),0) into v_shipped from public.shipments
    where (post_id=p_post_id or (post_id is null and order_no=v_post.order_no)) and cancelled is not true;
  if coalesce(v_post.order_amount,0)<=v_shipped then raise exception '注残がないため打ち切りできません'; end if;
  if exists(select 1 from public.inventory_allocations a left join public.inventory_items i on i.id=a.inventory_item_id
    where a.post_id=p_post_id and a.allocated_amount>a.shipped_amount and (i.id is null or i.lot_id is null)) then
    raise exception 'ロットに紐づかない在庫引当があります。管理者に確認してください';
  end if;
  -- Match shipment lock ordering: order, lots, inventory, allocations.
  for v_lot in select l.* from public.lots l where exists (
    select 1 from public.inventory_items i join public.inventory_allocations a on a.inventory_item_id=i.id
    where i.lot_id=l.id and a.post_id=p_post_id and a.allocated_amount>a.shipped_amount
  ) order by l.id for update loop
    for v_item in select i.* from public.inventory_items i where i.lot_id=v_lot.id and exists (
      select 1 from public.inventory_allocations a where a.inventory_item_id=i.id and a.post_id=p_post_id and a.allocated_amount>a.shipped_amount
    ) order by i.id for update loop
      v_total:=0;
      for v_allocation in select * from public.inventory_allocations
        where post_id=p_post_id and inventory_item_id=v_item.id and allocated_amount>shipped_amount order by id for update loop
        v_release:=v_allocation.allocated_amount-v_allocation.shipped_amount;
        v_total:=v_total+v_release;
        v_released:=v_released||jsonb_build_array(jsonb_build_object('allocation_id',v_allocation.id,'inventory_item_id',v_item.id,'quantity',v_release));
        update public.inventory_allocations set allocated_amount=shipped_amount where id=v_allocation.id;
      end loop;
      if v_total>coalesce(v_item.allocated_stock,0) then raise exception '在庫引当数量が一致しません。管理者に確認してください'; end if;
      update public.inventory_items set allocated_stock=allocated_stock-v_total,updated_at=now() where id=v_item.id;
    end loop;
    update public.lots set allocated_amount=(select coalesce(sum(allocated_stock),0) from public.inventory_items where lot_id=v_lot.id),updated_at=now() where id=v_lot.id;
  end loop;
  insert into public.order_shipment_closures(id,post_id,order_no,customer_name,product_name,order_amount,shipped_amount,closed_quantity,reason,actor_id,actor_name,released_allocations)
  values(p_request_id,p_post_id,coalesce(v_post.order_no,''),coalesce(v_post.customer_name,''),coalesce(v_post.product_name,''),v_post.order_amount,v_shipped,v_post.order_amount-v_shipped,btrim(p_reason),auth.uid(),v_actor,v_released)
  returning * into v_log;
  update public.posts set shipment_closed_at=v_log.closed_at,updated_at=now() where id=p_post_id;
  return v_log;
end $$;
revoke all on function public.close_order_shipments(uuid,text,uuid) from public,anon;
grant execute on function public.close_order_shipments(uuid,text,uuid) to authenticated;

create function public.guard_shipment_closure() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.shipment_closed_at is not null then raise exception '打ち切り状態を指定して受注を登録できません'; end if;
    return new;
  end if;
  if new.shipment_closed_at is distinct from old.shipment_closed_at then
    if old.shipment_closed_at is not null or not exists(select 1 from public.order_shipment_closures where post_id=new.id and closed_at=new.shipment_closed_at) then
      raise exception '打ち切り状態は専用の打ち切り処理でのみ変更できます';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_shipment_closure() from public,anon,authenticated;
create trigger trg_guard_shipment_closure before insert or update of shipment_closed_at on public.posts for each row execute function public.guard_shipment_closure();

create or replace function public.require_active_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.post_id is not null then
    perform 1 from public.posts where id=new.post_id and "delete" is not true and shipment_closed_at is null for update;
    if not found then raise exception '取消済み・打ち切り済みの注番には登録できません'; end if;
  end if;
  return new;
end $$;

create function public.guard_closed_order_shipment_cancellation() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.cancelled is distinct from old.cancelled then
    perform 1 from public.posts where (id=old.post_id or (old.post_id is null and order_no=old.order_no)) for update;
    if exists(select 1 from public.posts where (id=old.post_id or (old.post_id is null and order_no=old.order_no)) and shipment_closed_at is not null) then
      raise exception '打ち切り済み注番の出荷取消はできません。打ち切り履歴を確認してください';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_closed_order_shipment_cancellation() from public,anon,authenticated;
create trigger trg_guard_closed_order_shipment_cancellation before update of cancelled on public.shipments for each row execute function public.guard_closed_order_shipment_cancellation();

-- Append an explicit completion flag, preserving all existing view columns and their order.
do $$ declare definition text; begin
  definition:=rtrim(pg_get_viewdef('public.v_posts_with_master'::regclass,true),E';\n ');
  execute format('create or replace view public.v_posts_with_master with (security_invoker=true) as select original.*, p.shipment_closed_at from (%s) original join public.posts p on p.id=original.id',definition);
  definition:=rtrim(pg_get_viewdef('public.v_shipping_candidates'::regclass,true),E';\n ');
  execute format('create or replace view public.v_shipping_candidates with (security_invoker=true) as select candidate.* from (%s) candidate join public.posts p on p.id=candidate.post_id where p.shipment_closed_at is null',definition);
end $$;
notify pgrst,'reload schema';
commit;
