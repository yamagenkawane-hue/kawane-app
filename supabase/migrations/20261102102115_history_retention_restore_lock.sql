-- Apply the same AI concurrency protection to restore as well as purge.
begin;
create or replace function public.execute_history_retention(p_export uuid,p_packet jsonb,p_restore boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.history_exports; info jsonb; samples jsonb; ai_years integer;
begin
 perform app_private.assert_access(true);
 -- One order per operation. Serialize against normal writes and AI startup to avoid stale exports/partial deletion.
 set local lock_timeout='5s';
 lock table public.ai_prediction_runs,public.posts,public.order_processes,public.lots,public.shipments,public.inventory_items,public.inventory_allocations,public.lot_process_balance,public.production_schedules,public.production_results,public.process_transfer_history,public.outsource_remainder_schedules,public.history_exports,public.history_retention_settings in share row exclusive mode;
 if exists(select 1 from public.ai_prediction_runs where status='running') then raise exception 'AI更新中です。完了後に再実行してください'; end if;
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
commit;
