begin;
-- Independent immutable snapshots: retained even when old operational rows are purged.
create table public.order_cancellation_history (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null, post_id uuid not null,
 order_no text, customer_name text, product_name text, order_amount integer,
 actor_id uuid not null, actor_name text not null, cancelled_at timestamptz not null default now(),
 snapshot jsonb not null,
 unique(request_id,post_id)
);
create index order_cancellation_history_recent_idx on public.order_cancellation_history(cancelled_at desc,id);
alter table public.order_cancellation_history enable row level security;
revoke all on public.order_cancellation_history from public,anon,authenticated,service_role;
grant select on public.order_cancellation_history to authenticated;
create policy manager_read on public.order_cancellation_history for select to authenticated
 using((select app_private.is_member(true)));

-- A browser must not call the old password-free RPC, including from other screens.
revoke all on function public.soft_delete_order_post(uuid) from public,anon,authenticated;

create function public.cancel_mistaken_orders(p_post_ids uuid[],p_actor_id uuid,p_session_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.app_profiles; p public.posts; ids uuid[]; previous uuid[];
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'サーバー専用の処理です' using errcode='42501'; end if;
 if p_request_id is null or p_actor_id is null or p_session_id is null or p_post_ids is null
   or cardinality(p_post_ids) not between 1 and 100 or array_position(p_post_ids,null) is not null then
   raise exception '取消対象が不正です' using errcode='22023'; end if;
 select array_agg(distinct x order by x) into ids from unnest(p_post_ids) x;
 if cardinality(ids)<>cardinality(p_post_ids) then raise exception '取消対象が重複しています' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('order-cancellation:'||p_request_id::text,0));
 select * into actor from public.app_profiles where id=p_actor_id and active and manager for share;
 if not found then raise exception '管理者のみ操作できます' using errcode='42501'; end if;
 perform 1 from auth.sessions where id=p_session_id and user_id=p_actor_id for share;
 if not found then raise exception 'ログインを確認できません' using errcode='42501'; end if;
 select array_agg(post_id order by post_id) into previous from public.order_cancellation_history where request_id=p_request_id;
 if previous is not null then
   if previous is distinct from ids or exists(select 1 from public.order_cancellation_history where request_id=p_request_id and actor_id<>p_actor_id) then
     raise exception '同じ処理キーで異なる取消はできません' using errcode='22023'; end if;
   return;
 end if;
 -- Lock all target orders in a stable order, then mutate and journal atomically.
 perform 1 from public.posts where id=any(ids) order by id for update;
 if (select count(*) from public.posts where id=any(ids))<>cardinality(ids) then raise exception '受注データが見つかりません'; end if;
 for p in select * from public.posts where id=any(ids) order by id loop
   if p."delete" is true or p.shipment_closed_at is not null then raise exception '取消済み・完了済みの注番は誤登録取消できません'; end if;
   -- Existing guard_order_cancellation still rejects lots/results/allocation/shipping history.
   update public.posts set "delete"=true,updated_at=now() where id=p.id;
   insert into public.order_cancellation_history(request_id,post_id,order_no,customer_name,product_name,order_amount,actor_id,actor_name,snapshot)
   values(p_request_id,p.id,p.order_no,p.customer_name,p.product_name,p.order_amount,actor.id,actor.login_id,to_jsonb(p));
 end loop;
end $$;
revoke all on function public.cancel_mistaken_orders(uuid[],uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_mistaken_orders(uuid[],uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
