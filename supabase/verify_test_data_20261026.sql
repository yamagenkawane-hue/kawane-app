-- Exercise the real database functions and roll back all test actions.
begin;
do $$
declare
  v_post uuid;
  v_lot uuid;
  v_process uuid;
  v_balance uuid;
  v_shipment shipments%rowtype;
  v_blocked boolean;
  v_count integer;
begin
  select id into v_post from posts where order_no='T26-001';
  perform soft_delete_order_post(v_post);
  if not (select "delete" from posts where id=v_post) then raise exception '未着手の誤登録取消が反映されません'; end if;

  select id into v_post from posts where order_no='T26-002';
  v_blocked:=false;
  begin perform soft_delete_order_post(v_post);
    exception when raise_exception then v_blocked:=true;
  end;
  if not v_blocked then raise exception '実績のある注番を取り消せてしまいました'; end if;

  select id into v_post from posts where order_no='T26-004';
  select id into v_lot from lots where post_id=v_post and lot_no='T26-L004';
  select id into v_process from order_processes where post_id=v_post and process_order=4;
  perform complete_lot_from_progress(v_lot,v_process,100,'動作確認・終了時ロールバック','T26-verify-complete',date '2026-10-26');
  perform complete_lot_from_progress(v_lot,v_process,100,'動作確認・終了時ロールバック','T26-verify-complete',date '2026-10-26');
  if (select sum(current_stock) from inventory_items where lot_id=v_lot)<>100 then raise exception '完了・再送時の在庫数量が一致しません'; end if;
  if (select sum(quantity) from lot_process_balance where lot_id=v_lot)<>0 then raise exception '完了後も元工程に数量が残っています'; end if;

  select id into v_post from posts where order_no='T26-006';
  select id into v_lot from lots where post_id=v_post and lot_no='T26-L006';
  v_blocked:=false;
  begin perform register_shipment(v_post,v_lot,71,date '2026-10-26','T26-verify-over');
    exception when raise_exception then v_blocked:=true;
  end;
  if not v_blocked then raise exception '注残を超える出荷を登録できてしまいました'; end if;
  v_shipment:=register_shipment(v_post,v_lot,70,date '2026-10-26','T26-verify-full');
  if (select sum(current_stock) from inventory_items where lot_id=v_lot)<>0 then raise exception '全数出荷後の在庫が0ではありません'; end if;
  if (select sum(quantity) from shipments where post_id=v_post and cancelled is not true)<>100 then raise exception '全数出荷後の出荷合計が一致しません'; end if;
  if (select "delete" from posts where id=v_post) then raise exception '全数出荷で注番が削除されました'; end if;
  perform cancel_shipment_and_restore_inventory(v_shipment.id,'動作確認・終了時ロールバック');
  perform cancel_shipment_and_restore_inventory(v_shipment.id,'二重取消の確認');
  if (select sum(current_stock) from inventory_items where lot_id=v_lot)<>70 then raise exception '出荷取消で70個に復元されません'; end if;
  if (select sum(quantity) from shipments where post_id=v_post and cancelled is not true)<>30 then raise exception '取消後の有効出荷数が30個ではありません'; end if;

  select b.id into v_balance from lot_process_balance b join posts p on p.id=b.post_id
    where p.order_no='T26-008' and b.quantity>0;
  perform * from edit_lot_process_balance(v_balance,55,'進捗管理から数量編集','T26-verify-edit');
  if (select quantity from lot_process_balance where id=v_balance)<>55 then raise exception '数量編集が反映されません'; end if;
end $$;
select 'passed: mistaken-order cancellation, deletion guard, completion, retry, quantity limit, full shipment, cancellation, double cancellation, quantity edit' as verification,
  'All verification actions will be rolled back; the new test dataset is preserved.' as recovery;
rollback;
