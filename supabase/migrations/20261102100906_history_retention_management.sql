begin;
-- Support eligibility checks as order and history volumes grow.
create index if not exists retention_shipments_post_idx on public.shipments(post_id);
create index if not exists retention_shipments_legacy_order_idx on public.shipments(order_no) where post_id is null;
create index if not exists retention_allocations_post_idx on public.inventory_allocations(post_id);
create index if not exists retention_inventory_lot_no_idx on public.inventory_items(lot_no);
create index if not exists retention_results_process_idx on public.production_results(order_process_id);
create index if not exists retention_lots_measurement_idx on public.lots(measurement_result_id);
create index if not exists retention_transfer_source_idx on public.process_transfer_history(source_result_id);
create index if not exists retention_transfer_remainder_idx on public.process_transfer_history(outsource_remainder_schedule_id);
create index if not exists retention_balance_source_idx on public.lot_process_balance(source_result_id);
create table public.history_retention_settings (
 id boolean primary key default true check(id),
 detail_years integer not null default 3 check(detail_years between 1 and 30),
 ai_years integer not null default 5 check(ai_years between detail_years and 30),
 prediction_days integer not null default 90 check(prediction_days between 30 and 3650),
 updated_at timestamptz not null default now()
);
insert into public.history_retention_settings(id) values(true);
create table public.history_exports (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete restrict,
 digest text not null, created_by uuid not null, created_at timestamptz not null default now(),
 state text not null default 'prepared' check(state in ('prepared','archived','restored')),
 archived_at timestamptz, restored_at timestamptz
);
create index history_exports_post_idx on public.history_exports(post_id);
create unique index history_exports_active_idx on public.history_exports(post_id) where state='archived';
create table public.history_ai_samples (
 post_id uuid primary key references public.posts(id) on delete restrict,
 finished_at timestamptz not null,
 samples jsonb not null check(jsonb_typeof(samples)='array'), retained_until date not null
);
create index history_ai_samples_until_idx on public.history_ai_samples(retained_until);
create table public.history_retention_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null,
 post_id uuid, export_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index history_retention_events_date_idx on public.history_retention_events(created_at desc,id);
-- Read access is restricted to active managers; all mutations use checked RPCs.
alter table public.history_retention_settings enable row level security;
alter table public.history_exports enable row level security;
alter table public.history_ai_samples enable row level security;
alter table public.history_retention_events enable row level security;
create policy retention_settings_read on public.history_retention_settings for select to authenticated using((select app_private.is_member(true)));
create policy retention_exports_read on public.history_exports for select to authenticated using((select app_private.is_member(true)));
create policy retention_samples_read on public.history_ai_samples for select to authenticated using((select app_private.is_member(true)));
create policy retention_events_read on public.history_retention_events for select to authenticated using((select app_private.is_member(true)));
revoke all on public.history_retention_settings,public.history_exports,public.history_ai_samples,public.history_retention_events from public,anon,authenticated;
grant select on public.history_retention_settings,public.history_exports,public.history_ai_samples,public.history_retention_events to authenticated;
grant all on public.history_retention_settings,public.history_exports,public.history_ai_samples,public.history_retention_events to service_role;

create function public.save_history_retention_settings(p_detail integer,p_ai integer,p_prediction integer,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.assert_access(true);
 if p_detail is null or p_ai is null or p_prediction is null or p_detail not between 1 and 30 or p_ai not between p_detail and 30 or p_prediction not between 30 and 3650 then raise exception '保存期間が不正です'; end if;
 if exists(select 1 from public.ai_prediction_settings where max_reference_days>p_ai*365) then raise exception 'AI用実績の保存期間が最大参照期間より短くなっています'; end if;
 update public.history_retention_settings set detail_years=p_detail,ai_years=p_ai,prediction_days=p_prediction,updated_at=clock_timestamp() where id and updated_at=p_updated_at;
 if not found then raise exception '設定が変更されています。再読み込みしてください'; end if;
 update public.history_ai_samples set retained_until=(finished_at+make_interval(years=>p_ai))::date;
 insert into public.history_retention_events(actor_id,action,detail) values(auth.uid(),'settings',jsonb_build_object('detail_years',p_detail,'ai_years',p_ai,'prediction_days',p_prediction));
end $$;

-- Return an explicit reason instead of guessing missing dates or ownership.
create function app_private.history_eligibility(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.posts; finish timestamptz; yr integer; reason text; shipped bigint;
begin
 select * into p from public.posts where id=p_post;
 if not found then return jsonb_build_object('eligible',false,'reason','注文がありません'); end if;
 select detail_years into yr from public.history_retention_settings where id;
 select coalesce(sum(quantity),0),max(greatest(created_at,updated_at,delivery_date::timestamptz,scheduled_date::timestamptz)) into shipped,finish
 from public.shipments where (post_id=p.id or (post_id is null and order_no=p.order_no)) and not coalesce(cancelled,false);
 if coalesce(p.delete,false) then reason:='削除扱いの注文は対象外です';
 elsif coalesce(p.order_amount,0)<=0 or shipped<p.order_amount then reason:='注残があります';
 elsif (select count(*) from public.posts where order_no=p.order_no)>1 then reason:='注番が重複しています';
 elsif exists(select 1 from public.history_exports where post_id=p.id and state='archived') then reason:='詳細履歴は退避済みです';
 elsif exists(select 1 from public.ai_prediction_runs where status='running') then reason:='AI更新中です';
 elsif exists(select 1 from public.order_processes where post_id=p.id and (coalesce(completed_amount,0)<coalesce(planned_amount,0) or (coalesce(planned_amount,0)>0 and coalesce(outsource_returned_date,completed_date) is null) or (outsource_sent_date is not null and outsource_returned_date is null))) then reason:='未完了または完了日不明の工程があります';
 elsif exists(select 1 from public.outsource_remainder_schedules r join public.order_processes o on o.id=r.order_process_id where o.post_id=p.id and not r.cancelled and (r.returned_date is null or r.moved_amount<r.quantity)) then reason:='未完了の外注分割日程があります';
 elsif exists(select 1 from public.lot_process_balance where post_id=p.id and quantity>0) then reason:='工程の残数量があります';
 elsif exists(select 1 from public.inventory_allocations a where (a.post_id=p.id or a.lot_id in(select id from public.lots where post_id=p.id)) and a.allocated_amount>a.shipped_amount) then reason:='未消化の在庫引当があります';
 elsif exists(select 1 from public.inventory_items i where (i.lot_id in(select id from public.lots where post_id=p.id) or i.lot_no in(select lot_no from public.lots where post_id=p.id)) and (i.current_stock<>0 or i.allocated_stock<>0)) then reason:='ロットに在庫または引当残があります';
 elsif exists(select 1 from public.lots where post_id=p.id and (coalesce(inventory_amount,0)>0 or coalesce(packaged_amount,0)>coalesce(shipped_amount,0))) then reason:='ロットの残数量があります';
 elsif exists(select 1 from public.shipments s where s.post_id is distinct from p.id and s.lot_id in(select id from public.lots where post_id=p.id)) or exists(select 1 from public.inventory_allocations a where a.post_id is distinct from p.id and a.lot_id in(select id from public.lots where post_id=p.id)) then reason:='他注文からロットが参照されています';
 elsif exists(select 1 from public.production_results r where r.order_process_id in(select id from public.order_processes where post_id=p.id) and r.post_id is distinct from p.id) then reason:='工程と実績の注文が一致しません';
 elsif exists(select 1 from public.production_results r where r.post_id=p.id and r.lot_id is not null and not exists(select 1 from public.lots l where l.id=r.lot_id and l.post_id=p.id)) then reason:='他注文のロットに紐づく実績があります';
 elsif exists(select 1 from public.production_results r where r.post_id=p.id and r.order_process_id is null) then reason:='工程未紐付けの実績があります';
 elsif exists(select 1 from public.production_results r where r.post_id=p.id and coalesce(r.amount,0)>0 and (r.date is null or r.date>(now() at time zone 'Asia/Tokyo')::date)) then reason:='日付不明・未来の実績があります';
 end if;
 select greatest(finish,p.created_at,p.updated_at,
  (select max(greatest(completed_date::timestamptz,outsource_returned_date::timestamptz,updated_at)) from public.order_processes where post_id=p.id),
  (select max(greatest(r.returned_date::timestamptz,r.updated_at)) from public.outsource_remainder_schedules r join public.order_processes o on o.id=r.order_process_id where o.post_id=p.id),
  (select max(greatest(date::timestamptz,created_at)) from public.production_results where post_id=p.id),
  (select max(updated_at) from public.lots where post_id=p.id),
  (select max(created_at) from public.process_transfer_history where post_id=p.id)) into finish;
 if reason is null and (finish is null or finish>now()) then reason:='業務終了日が不明または未来です'; end if;
 if reason is null and finish>now()-make_interval(years=>yr) then reason:='保存期間内です'; end if;
 return jsonb_build_object('post_id',p.id,'order_no',p.order_no,'product_name',p.product_name,'finished_at',finish,'eligible',reason is null,'reason',coalesce(reason,'削除対象'));
end $$;

-- Keep headers and records referenced by live lot/balance anchors. Only these three detail sets are purged.
create function app_private.history_packet(p_post uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'post_id',p_post,'anchors',jsonb_build_object(
  'post',(select to_jsonb(p) from public.posts p where id=p_post),
  'processes',coalesce((select jsonb_agg(to_jsonb(o) order by id) from public.order_processes o where post_id=p_post),'[]'::jsonb),
  'lots',coalesce((select jsonb_agg(to_jsonb(l) order by id) from public.lots l where post_id=p_post),'[]'::jsonb),
  'shipments',coalesce((select jsonb_agg(to_jsonb(s) order by id) from public.shipments s where post_id=p_post or (post_id is null and order_no=(select order_no from public.posts where id=p_post))),'[]'::jsonb)
 ),'tables',jsonb_build_object(
 'production_results',coalesce((select jsonb_agg(to_jsonb(r) order by id) from public.production_results r where post_id=p_post
   and not exists(select 1 from public.lots l where l.measurement_result_id=r.id)
   and not exists(select 1 from public.lot_process_balance b where b.source_result_id=r.id)
   and not exists(select 1 from public.process_transfer_history t where t.source_result_id=r.id and t.post_id is distinct from p_post)),'[]'::jsonb),
 'process_transfer_history',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.process_transfer_history t where post_id=p_post),'[]'::jsonb),
 'outsource_remainder_schedules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.outsource_remainder_schedules r join public.order_processes o on o.id=r.order_process_id where o.post_id=p_post
   and not exists(select 1 from public.process_transfer_history t where t.outsource_remainder_schedule_id=r.id and t.post_id is distinct from p_post)),'[]'::jsonb)
 ));
$$;

create function public.preview_history_retention(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb; total bigint;
begin
 perform app_private.assert_access(true);
 if p_offset<0 then raise exception 'ページが不正です'; end if;
 select count(*) into total from public.posts;
 select coalesce(jsonb_agg(app_private.history_eligibility(id)),'[]'::jsonb) into rows from (select id from public.posts order by created_at,id offset p_offset limit 30) p;
 return jsonb_build_object('rows',rows,'total',total);
end $$;

create function public.prepare_history_export(p_post uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare eligibility jsonb; packet jsonb; export_id uuid;
begin
 perform app_private.assert_access(true);
 select app_private.history_eligibility(p_post) into eligibility;
 if not (eligibility->>'eligible')::boolean then raise exception '%',eligibility->>'reason'; end if;
 packet:=app_private.history_packet(p_post);
 if (select sum(jsonb_array_length(value)) from jsonb_each(packet->'tables'))=0 then raise exception '削除できる詳細履歴がありません'; end if;
 if octet_length(packet::text)>12000000 then raise exception '退避データが大きすぎます。個別の移行対応が必要です'; end if;
 insert into public.history_exports(post_id,digest,created_by) values(p_post,encode(sha256(convert_to(packet::text,'UTF8')),'hex'),auth.uid()) returning id into export_id;
 insert into public.history_retention_events(actor_id,action,post_id,export_id) values(auth.uid(),'export',p_post,export_id);
 return jsonb_build_object('export_id',export_id,'payload',packet);
end $$;

create function app_private.delete_history_details(packet jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.process_transfer_history where id in(select (r->>'id')::uuid from jsonb_array_elements(packet->'tables'->'process_transfer_history') r);
 delete from public.outsource_remainder_schedules where id in(select (r->>'id')::uuid from jsonb_array_elements(packet->'tables'->'outsource_remainder_schedules') r);
 delete from public.production_results where id in(select (r->>'id')::uuid from jsonb_array_elements(packet->'tables'->'production_results') r);
end $$;
create function app_private.restore_history_details(packet jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.production_results select * from jsonb_populate_recordset(null::public.production_results,packet->'tables'->'production_results');
 insert into public.outsource_remainder_schedules select * from jsonb_populate_recordset(null::public.outsource_remainder_schedules,packet->'tables'->'outsource_remainder_schedules');
 insert into public.process_transfer_history select * from jsonb_populate_recordset(null::public.process_transfer_history,packet->'tables'->'process_transfer_history');
end $$;

create function public.execute_history_retention(p_export uuid,p_packet jsonb,p_restore boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.history_exports; info jsonb; samples jsonb; ai_years integer;
begin
 perform app_private.assert_access(true);
 -- One order per operation. Serialize against normal writes and AI startup to avoid stale exports/partial deletion.
 set local lock_timeout='5s';
 lock table public.ai_prediction_runs,public.posts,public.order_processes,public.lots,public.shipments,public.inventory_items,public.inventory_allocations,public.lot_process_balance,public.production_schedules,public.production_results,public.process_transfer_history,public.outsource_remainder_schedules,public.history_exports,public.history_retention_settings in share row exclusive mode;
 select * into e from public.history_exports where id=p_export for update;
 if not found or e.digest<>encode(sha256(convert_to(p_packet::text,'UTF8')),'hex') or e.post_id::text<>p_packet->>'post_id' then raise exception '退避ファイルが登録内容と一致しません'; end if;
 if p_restore then
  if e.state<>'archived' then raise exception '復元対象ではありません'; end if;
  if (p_packet->'anchors') is distinct from (app_private.history_packet(e.post_id)->'anchors') then raise exception '基本情報が変更されています。個別の復元が必要です'; end if;
  update public.history_exports set state='restored',restored_at=now() where id=e.id;
  perform app_private.restore_history_details(p_packet);
  delete from public.history_ai_samples where post_id=e.post_id;
  update public.history_exports set state='restored',restored_at=now() where id=e.id;
  insert into public.history_retention_events(actor_id,action,post_id,export_id) values(auth.uid(),'restore',e.post_id,e.id);
  return jsonb_build_object('restored',true);
 end if;
 if e.state<>'prepared' or e.created_by<>auth.uid() or e.created_at<now()-interval '1 day' then raise exception '退避ファイルを再作成してください'; end if;
 info:=app_private.history_eligibility(e.post_id);
 if not (info->>'eligible')::boolean then raise exception '%',info->>'reason'; end if;
 if p_packet is distinct from app_private.history_packet(e.post_id) then raise exception '退避後にデータが変更されています。再作成してください'; end if;
 -- Actually delete+restore in a rolled-back subtransaction, including all FK/trigger checks.
 begin
  perform app_private.delete_history_details(p_packet);
  perform app_private.restore_history_details(p_packet);
  if p_packet is distinct from app_private.history_packet(e.post_id) then raise exception '復元検証で不一致が発生しました'; end if;
  raise exception using errcode='Z0001',message='restore probe rollback';
 exception when sqlstate 'Z0001' then null;
 end;
 select coalesce(jsonb_agg(jsonb_build_object('id',r->'id','post_id',r->'post_id','order_process_id',r->'order_process_id','process_id',r->'process_id','lot_id',r->'lot_id','process_name',r->'process_name','date',r->'date','amount',r->'amount')),'[]'::jsonb) into samples
 from jsonb_array_elements(p_packet->'tables'->'production_results') r where (r->>'amount')::numeric>0 and r->>'date' is not null;
 select s.ai_years into ai_years from public.history_retention_settings s where id;
 insert into public.history_ai_samples(post_id,samples,finished_at,retained_until) values(e.post_id,samples,(info->>'finished_at')::timestamptz,((info->>'finished_at')::timestamptz+make_interval(years=>ai_years))::date)
 on conflict(post_id) do update set samples=excluded.samples,finished_at=excluded.finished_at,retained_until=excluded.retained_until;
 perform app_private.delete_history_details(p_packet);
 update public.history_exports set state='archived',archived_at=now() where id=e.id;
 insert into public.history_retention_events(actor_id,action,post_id,export_id,detail) values(auth.uid(),'delete_details',e.post_id,e.id,jsonb_build_object('digest',e.digest,'restore_verified',true,'counts',(select jsonb_object_agg(key,jsonb_array_length(value)) from jsonb_each(p_packet->'tables'))));
 return jsonb_build_object('archived',true,'restore_verified',true);
end $$;

-- Anchor edits are blocked after purge; restore detail first to allow business corrections.
create function app_private.guard_archived_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; post_key uuid;
begin
 row_data:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if TG_TABLE_NAME='posts' then post_key:=(row_data->>'id')::uuid;
 elsif TG_TABLE_NAME='outsource_remainder_schedules' then select post_id into post_key from public.order_processes where id=(row_data->>'order_process_id')::uuid;
 elsif TG_TABLE_NAME='inventory_items' then select post_id into post_key from public.lots where id=(row_data->>'lot_id')::uuid;
 else post_key:=(row_data->>'post_id')::uuid; end if;
 if post_key is null and row_data->>'order_no' is not null then select id into post_key from public.posts where order_no=row_data->>'order_no' limit 1; end if;
 if TG_TABLE_NAME='inventory_items' and exists(select 1 from public.lots l join public.history_exports e on e.post_id=l.post_id and e.state='archived' where l.id=(row_data->>'lot_id')::uuid or l.lot_no=row_data->>'lot_no' or (TG_OP<>'INSERT' and (l.id=(to_jsonb(old)->>'lot_id')::uuid or l.lot_no=to_jsonb(old)->>'lot_no'))) then raise exception '退避済みロットの在庫を変更できません'; end if;
 if exists(select 1 from public.lots l join public.history_exports e on e.post_id=l.post_id and e.state='archived' where l.id=(row_data->>'lot_id')::uuid or (TG_OP<>'INSERT' and l.id=(to_jsonb(old)->>'lot_id')::uuid)) then raise exception '退避済みロットの履歴を変更できません'; end if;
 if exists(select 1 from public.order_processes o join public.history_exports e on e.post_id=o.post_id and e.state='archived' where o.id=(row_data->>'order_process_id')::uuid or (TG_OP<>'INSERT' and o.id=(to_jsonb(old)->>'order_process_id')::uuid)) then raise exception '退避済み工程の履歴を変更できません'; end if;
 if exists(select 1 from public.history_exports where post_id=post_key and state='archived') then raise exception '詳細履歴を退避済みです。履歴管理マスタで復元してから変更してください'; end if;
 if TG_OP<>'INSERT' and TG_TABLE_NAME<>'posts' and (to_jsonb(old)->>'post_id') is distinct from (row_data->>'post_id') then
  if exists(select 1 from public.history_exports where post_id=(to_jsonb(old)->>'post_id')::uuid and state='archived') then raise exception '退避済み注文の関連を変更できません'; end if;
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['posts','order_processes','lots','shipments','inventory_allocations','production_schedules','production_results','process_transfer_history','outsource_remainder_schedules','lot_process_balance','inventory_items'] loop
 execute format('create trigger retention_guard before insert or update or delete on public.%I for each row execute function app_private.guard_archived_history()',t);
 end loop;
end $$;
-- Internal helpers cannot be called over the API.
revoke all on function app_private.history_eligibility(uuid),app_private.history_packet(uuid),app_private.delete_history_details(jsonb),app_private.restore_history_details(jsonb),app_private.guard_archived_history() from public,anon,authenticated,service_role;
revoke all on function public.save_history_retention_settings(integer,integer,integer,timestamptz),public.preview_history_retention(integer),public.prepare_history_export(uuid),public.execute_history_retention(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_history_retention_settings(integer,integer,integer,timestamptz),public.preview_history_retention(integer),public.prepare_history_export(uuid),public.execute_history_retention(uuid,jsonb,boolean) to authenticated,service_role;
create function app_private.guard_ai_retention_period() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.max_reference_days>(select ai_years*365 from public.history_retention_settings where id) then raise exception 'AIの最大参照期間は、履歴管理マスタのAI用実績保存期間以内にしてください'; end if;
 return new;
end $$;
revoke all on function app_private.guard_ai_retention_period() from public,anon,authenticated,service_role;
create trigger retention_ai_period before insert or update on public.ai_prediction_settings for each row execute function app_private.guard_ai_retention_period();
create function public.history_archived_order_ids(p_ids uuid[]) returns setof uuid
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.assert_access(false);
 if cardinality(p_ids)>30 then raise exception '対象が多すぎます'; end if;
 return query select post_id from public.history_exports where state='archived' and post_id=any(p_ids);
end $$;
revoke all on function public.history_archived_order_ids(uuid[]) from public,anon;
grant execute on function public.history_archived_order_ids(uuid[]) to authenticated,service_role;
commit;
