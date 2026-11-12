begin;
alter table public.app_profiles add column display_name text not null default '' check(length(display_name)<=100 and display_name=btrim(display_name));
grant select(display_name) on public.app_profiles to authenticated;

-- One snapshot for each event currently displayed in the lot history.
-- Names are captured at operation time, not joined to mutable profiles afterwards.
create table app_private.lot_history_actor_snapshots(
 source_table text not null,source_id uuid not null,event_kind text not null,
 actor_id uuid,actor_name text not null,recorded_at timestamptz not null default now(),
 primary key(source_table,source_id,event_kind)
);
alter table app_private.lot_history_actor_snapshots enable row level security;
revoke all on app_private.lot_history_actor_snapshots from public,anon,authenticated,service_role;
create policy deny_client_access on app_private.lot_history_actor_snapshots for all to public using(false) with check(false);
-- Trusted transaction-local restore marker. A client-set GUC is not trusted.
create table app_private.lot_history_actor_restores(tx bigint primary key);
alter table app_private.lot_history_actor_restores enable row level security;
revoke all on app_private.lot_history_actor_restores from public,anon,authenticated,service_role;
create policy deny_client_access on app_private.lot_history_actor_restores for all to public using(false) with check(false);

create function app_private.capture_lot_history_actor() returns trigger
language plpgsql security definer set search_path='' as $$
declare data jsonb:=to_jsonb(new); before_data jsonb; fields text[]:='{}'; kinds text[]:='{}'; field text; kind text;
 who uuid; label text;
begin
 if exists(select 1 from app_private.lot_history_actor_restores where tx=txid_current()) then return new; end if;
 if tg_op='UPDATE' then before_data:=to_jsonb(old); else before_data:='{}'; end if;
 who:=auth.uid();
 select coalesce(nullif(btrim(display_name),''),login_id) into label from public.app_profiles where id=who;
 if label is null then
   who:=null;
   label:=case when coalesce(auth.jwt()->>'role','')='service_role' then 'システム' else '不明' end;
 end if;
 case tg_table_name
 when 'production_results' then
   if tg_op='INSERT' or (data-'updated_at') is distinct from (before_data-'updated_at') then kinds:=array['record']; end if;
 when 'process_transfer_history' then
   if tg_op='INSERT' then kinds:=array['record']; end if;
 when 'inventory_items' then
   if tg_op='INSERT' or data->'current_stock' is distinct from before_data->'current_stock' or data->'allocated_stock' is distinct from before_data->'allocated_stock' then kinds:=array['record']; end if;
 when 'inventory_allocations' then
   if tg_op='INSERT' then kinds:=array['record']; end if;
 when 'shipments' then
   if tg_op='INSERT' then kinds:=array['record']; end if;
   if data->>'cancelled'='true' and before_data->>'cancelled' is distinct from 'true' then kinds:=array_append(kinds,'cancel'); end if;
 when 'order_processes' then fields:=array['outsource_sent_date','outsource_expected_return_date','outsource_returned_date'];
 when 'outsource_remainder_schedules' then
   fields:=array['sent_date','expected_date','returned_date'];
   if data->>'cancelled'='true' and before_data->>'cancelled' is distinct from 'true' then kinds:=array['cancel']; end if;
 when 'lots' then
   fields:=array['measured_at','packaged_at'];
   if tg_op='INSERT' then kinds:=array['record']; end if;
 end case;
 foreach field in array fields loop
   if data->>field is not null and data->field is distinct from before_data->field then kinds:=array_append(kinds,field); end if;
 end loop;
 foreach kind in array kinds loop
   insert into app_private.lot_history_actor_snapshots(source_table,source_id,event_kind,actor_id,actor_name)
     values(tg_table_name,new.id,kind,who,label)
     on conflict(source_table,source_id,event_kind) do update set actor_id=excluded.actor_id,actor_name=excluded.actor_name,recorded_at=now();
 end loop;
 return new;
end $$;
revoke all on function app_private.capture_lot_history_actor() from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['production_results','process_transfer_history','inventory_items','inventory_allocations','shipments','order_processes','outsource_remainder_schedules','lots'] loop
   execute format('create trigger capture_lot_history_actor after insert or update on public.%I for each row execute function app_private.capture_lot_history_actor()',t);
 end loop;
end $$;

-- This endpoint exposes only operation labels for the requested lot/order,
-- never Auth email addresses or the profile directory.
create function public.get_lot_history_actors(p_lot_id uuid)
returns table(source_table text,source_id uuid,event_kind text,actor_name text)
language plpgsql stable security definer set search_path='' as $$
declare target public.lots;
begin
 perform app_private.assert_access(false);
 select * into target from public.lots where id=p_lot_id and deleted is not true;
 if not found then return; end if;
 return query
 with scope as (
   select 'production_results'::text t,r.id from public.production_results r where r.post_id=target.post_id or r.lot_id=target.id
   union all select 'process_transfer_history',h.id from public.process_transfer_history h where h.lot_id=target.id
   union all select 'inventory_items',i.id from public.inventory_items i where i.lot_id=target.id
   union all select 'inventory_allocations',a.id from public.inventory_allocations a where a.lot_id=target.id or a.post_id=target.post_id
   union all select 'shipments',s.id from public.shipments s where s.lot_id=target.id or s.post_id=target.post_id
   union all select 'order_processes',o.id from public.order_processes o where o.post_id=target.post_id
   union all select 'outsource_remainder_schedules',r.id from public.outsource_remainder_schedules r join public.order_processes o on o.id=r.order_process_id where o.post_id=target.post_id
   union all select 'lots',target.id
 ), stored as (
   select a.source_table,a.source_id,a.event_kind,a.actor_name from app_private.lot_history_actor_snapshots a
   join scope s on s.t=a.source_table and s.id=a.source_id
 ), legacy as (
   -- Only explicit historical IDs are used. No time/name-based attribution.
   select 'process_transfer_history'::text t,h.id,'record'::text kind,
     coalesce(nullif(p.display_name,''),p.login_id) label
   from public.process_transfer_history h join public.app_profiles p on p.id=h.created_by
   where h.lot_id=target.id
 )
 select a.source_table,a.source_id,a.event_kind,a.actor_name from stored a
 union all select l.t,l.id,l.kind,l.label from legacy l
 where not exists(select 1 from stored a where a.source_table=l.t and a.source_id=l.id and a.event_kind=l.kind)
 order by 1,2,3;
end $$;
revoke all on function public.get_lot_history_actors(uuid) from public,anon;
grant execute on function public.get_lot_history_actors(uuid) to authenticated,service_role;

-- Preserve the currently installed archive compatibility rules without editing
-- applied migrations or changing the public retention transaction/authorization.
do $$ declare n text; signature text; definition text; begin
 foreach n in array array['history_packet','delete_history_details','restore_history_details'] loop
   signature:=case when n='history_packet' then 'uuid' else 'jsonb' end;
   select pg_get_functiondef(to_regprocedure('app_private.'||n||'('||signature||')')) into definition;
   if definition is null then raise exception 'Missing retention helper %',n; end if;
   execute replace(definition,'FUNCTION app_private.'||n||'(','FUNCTION app_private.'||n||'_before_actors(');
   execute format('revoke all on function app_private.%I(%s) from public,anon,authenticated,service_role',n||'_before_actors',signature);
 end loop;
end $$;

create or replace function app_private.history_packet(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare packet jsonb; snapshots jsonb;
begin
 packet:=app_private.history_packet_before_actors(p_post);
 with scope as (
   select t.key as t,(r->>'id')::uuid as id from jsonb_each(packet->'tables') t cross join lateral jsonb_array_elements(t.value) r
   union all select 'lots',(r->>'id')::uuid from jsonb_array_elements(packet->'anchors'->'lots') r
   union all select 'order_processes',(r->>'id')::uuid from jsonb_array_elements(packet->'anchors'->'processes') r
   union all select 'shipments',(r->>'id')::uuid from jsonb_array_elements(packet->'anchors'->'shipments') r
   union all select 'inventory_items',i.id from public.inventory_items i join public.lots l on l.id=i.lot_id where l.post_id=p_post
   union all select 'inventory_allocations',a.id from public.inventory_allocations a where a.post_id=p_post or a.lot_id in(select id from public.lots where post_id=p_post)
 ) select jsonb_agg(to_jsonb(a) order by a.source_table,a.source_id,a.event_kind) into snapshots
   from app_private.lot_history_actor_snapshots a join scope s on s.t=a.source_table and s.id=a.source_id;
 -- Absent metadata stays absent, preserving existing v1 packets and their hashes.
 if snapshots is not null then packet:=packet||jsonb_build_object('history_actors',snapshots); end if;
 return packet;
end $$;

create or replace function app_private.delete_history_details(packet jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.delete_history_details_before_actors(packet);
 delete from app_private.lot_history_actor_snapshots a using jsonb_each(packet->'tables') t
 where a.source_table=t.key and a.source_id in(select (r->>'id')::uuid from jsonb_array_elements(t.value) r);
end $$;

create or replace function app_private.restore_history_details(packet jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.lot_history_actor_restores values(txid_current());
 perform app_private.restore_history_details_before_actors(packet);
 insert into app_private.lot_history_actor_snapshots(source_table,source_id,event_kind,actor_id,actor_name,recorded_at)
 select r->>'source_table',(r->>'source_id')::uuid,r->>'event_kind',(r->>'actor_id')::uuid,r->>'actor_name',(r->>'recorded_at')::timestamptz
 from jsonb_array_elements(coalesce(packet->'history_actors','[]'::jsonb)) r
 on conflict(source_table,source_id,event_kind) do nothing;
 delete from app_private.lot_history_actor_restores where tx=txid_current();
exception when others then
 delete from app_private.lot_history_actor_restores where tx=txid_current();
 raise;
end $$;
revoke all on function app_private.history_packet(uuid),app_private.delete_history_details(jsonb),app_private.restore_history_details(jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
