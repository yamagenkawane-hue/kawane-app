-- Keep the user's current test dataset intact: all verification actions are rolled back.
begin;
do $$ declare
  v_process uuid;
  v_lot uuid;
  v_next uuid;
  v_quantity integer;
  v_blocked boolean:=false;
begin
  select op.id,l.id,b.quantity into v_process,v_lot,v_quantity
    from order_processes op join posts p on p.id=op.post_id
    join lot_process_balance b on b.order_process_id=op.id join lots l on l.id=b.lot_id
    where p.order_no='T26-002' and op.process_order=2 and b.quantity>0;
  if v_process is null then raise exception '検証対象の未移動ロットがありません'; end if;
  if exists(select 1 from order_processes where id=v_process and
    (outsource_sent_date is not null or outsource_expected_return_date is not null or outsource_returned_date is not null)) then
    raise exception '検証対象の日程が既に変更されています。ユーザーの操作状態を確認してください';
  end if;
  update order_processes set locked=true where id=v_process;
  begin
    perform transfer_outsource_lot_with_dates(v_lot,v_process,v_quantity,'2026-10-13','2026-10-15','2026-10-16','T26-verify-outsource-locked');
  exception when raise_exception then v_blocked:=true;
  end;
  if not v_blocked then raise exception 'ロック済み工程を移動できてしまいました'; end if;
  if exists(select 1 from order_processes where id=v_process and outsource_sent_date is not null) then
    raise exception '移動失敗後に日程だけが保存されました';
  end if;
  update order_processes set locked=false where id=v_process;
  perform transfer_outsource_lot_with_dates(v_lot,v_process,v_quantity,'2026-10-13','2026-10-15','2026-10-16','T26-verify-outsource-success');
  perform transfer_outsource_lot_with_dates(v_lot,v_process,v_quantity,'2026-10-13','2026-10-15','2026-10-16','T26-verify-outsource-success');
  if not exists(select 1 from order_processes where id=v_process and outsource_sent_date='2026-10-13'
    and outsource_expected_return_date='2026-10-15' and outsource_returned_date='2026-10-16'
    and outsource_status='returned' and completed_amount=v_quantity and completed_date='2026-10-16') then
    raise exception '外注日程と作業実績が一致しません';
  end if;
  if (select quantity from lot_process_balance where lot_id=v_lot and order_process_id=v_process)<>0 then
    raise exception '元工程に数量が残っています';
  end if;
  select op.id into v_next from order_processes op where post_id=(select post_id from order_processes where id=v_process) and process_order=3;
  if (select quantity from lot_process_balance where lot_id=v_lot and order_process_id=v_next)<>v_quantity then
    raise exception '次工程の数量が一致しません';
  end if;
  if (select count(*) from process_transfer_history where idempotency_key='T26-verify-outsource-success')<>1 then
    raise exception '再送で工程移動が重複しました';
  end if;
end $$;
select 'passed: dates saved, returned status, actual work date, next-process balance, idempotency, rollback on transfer failure' as verification;
rollback;
