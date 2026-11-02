begin;
-- Save dispatch dates without recording production or moving balances until an actual return is supplied.
create function public.register_outsource_progress(
 p_lot_id uuid,p_from_order_process_id uuid,p_amount integer,
 p_sent_date date,p_expected_date date,p_returned_date date,p_idempotency_key text,
 p_is_remainder boolean default false,p_schedule_id uuid default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_source public.order_processes; v_history public.process_transfer_history;
 v_schedule public.outsource_remainder_schedules; v_post uuid; v_before integer; v_balance uuid;
 v_request uuid; v_schedule_id uuid; v_today date:=(now() at time zone 'Asia/Tokyo')::date;
begin
 perform app_private.assert_access(false);
 if nullif(trim(p_idempotency_key),'') is null then raise exception '処理キーが必要です'; end if;
 v_request:=p_idempotency_key::uuid;
 if p_is_remainder is null then raise exception '日程区分が不正です'; end if;
 if p_sent_date is null then raise exception '出し日を入力してください'; end if;
 if p_sent_date>v_today or p_returned_date>v_today then raise exception '出し日・実績日は本日以前の日付を入力してください'; end if;
 if p_expected_date<p_sent_date or p_returned_date<p_sent_date then raise exception '予定日・実績日は出し日以降の日付を入力してください'; end if;
 if p_amount is null or p_amount<=0 then raise exception '数量は1以上で入力してください'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
 select * into v_history from public.process_transfer_history where idempotency_key=p_idempotency_key;
 if found then
  if v_history.lot_id is distinct from p_lot_id or v_history.from_order_process_id is distinct from p_from_order_process_id
   or v_history.quantity is distinct from p_amount or p_returned_date is null
   or p_is_remainder is distinct from (v_history.outsource_remainder_schedule_id is not null)
   or (p_is_remainder and v_history.outsource_remainder_schedule_id is distinct from coalesce(p_schedule_id,v_request))
   or not exists(select 1 from public.production_results where id=v_history.source_result_id and date=p_returned_date) then
   raise exception '同じ処理キーで異なる登録はできません';
  end if;
  return true;
 end if;
 select post_id into v_post from public.order_processes where id=p_from_order_process_id;
 perform 1 from public.posts where id=v_post and "delete" is not true for update;
 if not found then raise exception '有効な注番が見つかりません'; end if;
 select * into v_source from public.order_processes where id=p_from_order_process_id for update;
 if v_source.locked then raise exception 'ロックされた工程の日程は変更できません'; end if;
 if not (v_source.subcontractor_id is not null or v_source.process_name ~ '外注|メッキ'
  or exists(select 1 from public.product_processes pp join public.process_master pm on pm.id=pp.process_master_id where pp.id=v_source.product_process_id and pm.outsourcing is true)) then raise exception '外注加工の工程ではありません'; end if;
 perform 1 from public.lots where id=p_lot_id and post_id=v_post and not coalesce(deleted,false) for update;
 if not found then raise exception '有効なロットが見つかりません'; end if;
 select id,quantity into v_balance,v_before from public.lot_process_balance where lot_id=p_lot_id and order_process_id=p_from_order_process_id for update;
 if not found or v_before<p_amount then raise exception '現在数量を超えて登録できません'; end if;
 if p_is_remainder then
  v_schedule_id:=coalesce(p_schedule_id,v_request);
  select * into v_schedule from public.outsource_remainder_schedules where id=v_schedule_id for update;
  if p_schedule_id is not null and not found then raise exception '追加日程が見つかりません'; end if;
  if v_schedule.id is not null and (v_schedule.order_process_id<>p_from_order_process_id or v_schedule.cancelled) then raise exception '追加日程の対象が一致しません'; end if;
  if v_schedule.id is not null and p_amount>v_schedule.quantity-v_schedule.moved_amount then raise exception '追加日程の未移動数量を超えています'; end if;
  -- Dates already registered in the dialog must not be overwritten by a stale request.
  if (v_schedule.sent_date is not null and v_schedule.sent_date is distinct from p_sent_date)
   or (v_schedule.expected_date is not null and v_schedule.expected_date is distinct from p_expected_date)
   or (v_schedule.returned_date is not null and v_schedule.returned_date is distinct from p_returned_date) then raise exception '追加日程が更新されています。再読み込みしてください'; end if;
  v_schedule:=public.save_outsource_remainder_schedule(v_schedule_id,p_from_order_process_id,coalesce(v_schedule.quantity,p_amount),p_sent_date,p_expected_date,p_returned_date,coalesce(v_schedule.note,''),v_schedule.updated_at,false);
  if p_returned_date is null then return false; end if;
  perform * from public.transfer_lot_to_next_process(p_lot_id,p_from_order_process_id,p_amount,'進捗管理から残数外注日程登録・工程移動',p_idempotency_key,p_returned_date);
  if v_before>p_amount then
   update public.lot_process_balance set quantity=v_before-p_amount,updated_at=now() where id=v_balance;
   update public.process_transfer_history set after_from_quantity=v_before-p_amount,correction_quantity=0,movement_type='process_transfer' where idempotency_key=p_idempotency_key;
  end if;
  update public.process_transfer_history set outsource_remainder_schedule_id=v_schedule_id where idempotency_key=p_idempotency_key;
  update public.outsource_remainder_schedules set moved_amount=moved_amount+p_amount,updated_at=clock_timestamp() where id=v_schedule_id;
 else
  if p_schedule_id is not null then raise exception '初回分には追加日程を指定できません'; end if;
  if v_source.completed_amount>0 and v_source.outsource_returned_date is not null then raise exception '残数分の外注日程を選択してください'; end if;
  if (v_source.outsource_sent_date is not null and v_source.outsource_sent_date is distinct from p_sent_date)
   or (v_source.outsource_expected_return_date is not null and v_source.outsource_expected_return_date is distinct from p_expected_date)
   or (v_source.outsource_returned_date is not null and v_source.outsource_returned_date is distinct from p_returned_date) then raise exception '登録済みの外注日程が更新されています。再読み込みしてください'; end if;
  update public.order_processes set outsource_sent_date=p_sent_date,outsource_expected_return_date=p_expected_date,
   outsource_returned_date=p_returned_date,outsource_status=case when p_returned_date is null then 'sent' else 'returned' end,updated_at=now() where id=p_from_order_process_id;
  if p_returned_date is null then return false; end if;
  perform * from public.transfer_lot_to_next_process(p_lot_id,p_from_order_process_id,p_amount,'進捗管理から外注日程登録・次工程移動（数量補正を含む）',p_idempotency_key,p_returned_date);
 end if;
 return true;
end $$;
revoke all on function public.register_outsource_progress(uuid,uuid,integer,date,date,date,text,boolean,uuid) from public,anon;
grant execute on function public.register_outsource_progress(uuid,uuid,integer,date,date,date,text,boolean,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
