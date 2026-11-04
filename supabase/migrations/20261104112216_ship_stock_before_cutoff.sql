begin;
create table app_private.shipment_cutoff_requests (
  id uuid primary key,
  post_id uuid not null references public.posts(id) on delete restrict,
  actor_id uuid not null,
  scheduled_date date,
  reason text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index shipment_cutoff_requests_post_idx on app_private.shipment_cutoff_requests(post_id);
alter table app_private.shipment_cutoff_requests enable row level security;
revoke all on app_private.shipment_cutoff_requests from public,anon,authenticated;

create function public.ship_stock_and_close_order(p_post_id uuid,p_scheduled_date date,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_post public.posts%rowtype;
  v_lot public.lots%rowtype;
  v_shipment public.shipments%rowtype;
  v_closure public.order_shipment_closures%rowtype;
  v_replay app_private.shipment_cutoff_requests%rowtype;
  v_shipped bigint;
  v_remaining bigint;
  v_available bigint;
  v_quantity integer;
  v_sent bigint:=0;
  v_result jsonb;
begin
  perform app_private.assert_access(false);
  if auth.uid() is null or not exists(select 1 from public.app_profiles where id=auth.uid() and active) then
    raise exception 'ログイン状態を確認してください' using errcode='42501';
  end if;
  if p_post_id is null or p_request_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception '注番・処理キーを確認してください';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cutoff:'||p_request_id::text,0));
  select * into v_replay from app_private.shipment_cutoff_requests where id=p_request_id;
  if found then
    if v_replay.post_id<>p_post_id or v_replay.actor_id<>auth.uid() or v_replay.scheduled_date is distinct from p_scheduled_date or v_replay.reason<>btrim(p_reason) then
      raise exception '同じ処理キーで異なる出荷・打ち切りは登録できません';
    end if;
    return v_replay.result;
  end if;
  select * into v_post from public.posts where id=p_post_id for update;
  if not found or v_post."delete" is true then raise exception '有効な注番が見つかりません'; end if;
  if v_post.shipment_closed_at is not null then raise exception 'この注番はすでに打ち切り済みです'; end if;
  select coalesce(sum(quantity),0) into v_shipped from public.shipments
    where (post_id=p_post_id or (post_id is null and order_no=v_post.order_no)) and cancelled is not true;
  v_remaining:=coalesce(v_post.order_amount,0)-v_shipped;
  if v_remaining<=0 then raise exception '注残がありません'; end if;
  -- Lock the same lots and inventory used by normal shipping, in the same order.
  for v_lot in select * from public.lots l where l.deleted is not true and
    (l.product_id=v_post.product_id or (l.product_id is null or v_post.product_id is null)
      and nullif(v_post.product_code,'') is not null and l.product_code=v_post.product_code)
    order by l.id for update loop
    exit when v_remaining=0;
    perform i.id from public.inventory_items i where i.lot_id=v_lot.id order by i.id for update;
    select coalesce(sum(greatest(i.current_stock-coalesce(i.allocated_stock,0),0)+coalesce(a.quantity,0)),0) into v_available
      from public.inventory_items i left join lateral (
        select sum(greatest(allocated_amount-shipped_amount,0)) as quantity from public.inventory_allocations
        where post_id=p_post_id and inventory_item_id=i.id
      ) a on true where i.lot_id=v_lot.id;
    v_quantity:=least(v_remaining,v_available,2147483647)::integer;
    if v_quantity>0 then
      if p_scheduled_date is null then raise exception '出荷予定日がありません。納期を設定してから実行してください'; end if;
      v_shipment:=public.register_shipment(p_post_id,v_lot.id,v_quantity,p_scheduled_date,'cutoff:'||p_request_id::text||':'||v_lot.id::text);
      v_sent:=v_sent+v_quantity;
      v_remaining:=v_remaining-v_quantity;
    end if;
  end loop;
  if v_remaining>0 then
    v_closure:=public.close_order_shipments(p_post_id,btrim(p_reason),p_request_id);
  end if;
  v_result:=jsonb_build_object('shipped_quantity',v_sent,'shipped_total',v_shipped+v_sent,'closed_quantity',v_remaining,'closure_id',v_closure.id);
  insert into app_private.shipment_cutoff_requests(id,post_id,actor_id,scheduled_date,reason,result)
    values(p_request_id,p_post_id,auth.uid(),p_scheduled_date,btrim(p_reason),v_result);
  return v_result;
end $$;
revoke all on function public.ship_stock_and_close_order(uuid,date,text,uuid) from public,anon;
grant execute on function public.ship_stock_and_close_order(uuid,date,text,uuid) to authenticated;
-- Direct callers must also use the atomic ship-then-cutoff operation.
revoke execute on function public.close_order_shipments(uuid,text,uuid) from authenticated;
notify pgrst,'reload schema';
commit;
