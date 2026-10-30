begin;
-- Save missing outsourcing dates and transfer the lot in the same transaction.
create or replace function public.transfer_outsource_lot_with_dates(
  p_lot_id uuid,p_from_order_process_id uuid,p_amount integer,
  p_sent_date date,p_expected_date date,p_returned_date date,p_idempotency_key text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_source order_processes%rowtype;
  v_history process_transfer_history%rowtype;
  v_post_id uuid;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception '処理キーが必要です'; end if;
  if p_sent_date is null or p_expected_date is null or p_returned_date is null then
    raise exception '出し日・予定日・実績日をすべて入力してください';
  end if;
  if p_sent_date>(now() at time zone 'Asia/Tokyo')::date or p_returned_date>(now() at time zone 'Asia/Tokyo')::date then
    raise exception '出し日・実績日は本日以前の日付を入力してください';
  end if;
  if p_expected_date<p_sent_date or p_returned_date<p_sent_date then
    raise exception '予定日・実績日は出し日以降の日付を入力してください';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  select * into v_history from process_transfer_history where idempotency_key=p_idempotency_key;
  if found then
    if v_history.lot_id is distinct from p_lot_id or v_history.from_order_process_id is distinct from p_from_order_process_id
      or v_history.quantity is distinct from p_amount
      or not exists(select 1 from production_results where id=v_history.source_result_id and date=p_returned_date) then
      raise exception '同じ処理キーで異なる工程移動は登録できません';
    end if;
    return;
  end if;
  select post_id into v_post_id from order_processes where id=p_from_order_process_id;
  perform 1 from posts where id=v_post_id and "delete" is not true for update;
  if not found then raise exception '有効な注番が見つかりません'; end if;
  select * into v_source from order_processes where id=p_from_order_process_id for update;
  if not found then raise exception '工程が見つかりません'; end if;
  if not (v_source.subcontractor_id is not null or v_source.process_name ~ '外注|メッキ'
    or exists(select 1 from product_processes pp join process_master pm on pm.id=pp.process_master_id
      where pp.id=v_source.product_process_id and pm.outsourcing is true)) then
    raise exception '外注加工の工程ではありません';
  end if;
  if (v_source.outsource_sent_date is not null and v_source.outsource_sent_date<>p_sent_date)
    or (v_source.outsource_expected_return_date is not null and v_source.outsource_expected_return_date<>p_expected_date)
    or (v_source.outsource_returned_date is not null and v_source.outsource_returned_date<>p_returned_date) then
    raise exception '登録済みの外注日程が更新されています。画面を再読み込みしてください';
  end if;
  update order_processes set outsource_sent_date=p_sent_date,outsource_expected_return_date=p_expected_date,
    outsource_returned_date=p_returned_date,outsource_status='returned',updated_at=now() where id=v_source.id;
  perform * from transfer_lot_to_next_process(p_lot_id,p_from_order_process_id,p_amount,
    '進捗管理から外注日程登録・次工程移動（数量補正を含む）',p_idempotency_key,p_returned_date);
end $$;
revoke all on function public.transfer_outsource_lot_with_dates(uuid,uuid,integer,date,date,date,text) from public;
grant execute on function public.transfer_outsource_lot_with_dates(uuid,uuid,integer,date,date,date,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
