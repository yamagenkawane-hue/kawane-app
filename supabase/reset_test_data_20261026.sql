-- Explicitly authorised test workflow: replace ALL operational data, preserve ALL masters.
-- Apply 20261026_safe_shipping_and_order_cancellation.sql and 20261026_progress_completion.sql first.
-- The operator wraps migrations and this script in ONE transaction after creating a private backup.
set local search_path=public;
set local lock_timeout='10s';

lock table posts,order_processes,production_schedules,lots,production_results,
  lot_process_balance,process_transfer_history,inventory_items,inventory_allocations,shipments,
  ai_prediction_latest,ai_prediction_results,ai_prediction_input_snapshots,
  ai_prediction_evaluations,ai_prediction_runs,legacy_post_process_logs_archive in access exclusive mode;

do $$ begin
  if exists(select 1 from ai_prediction_runs where status='running') then
    raise exception '予測処理が実行中です。終了後にデータを入れ替えてください';
  end if;
  if (select count(*) from product_master where product_code in
    ('TEST-P101','TEST-P102','TEST-P103','TEST-P104','TEST-P105'))<>5 then
    raise exception '必要な既存テスト製品が見つかりません。マスターは自動変更しません';
  end if;
end $$;

create schema test_reset_backup_20261026;
-- Backup is private to the database owner, outside the REST-exposed public schema.
revoke all on schema test_reset_backup_20261026 from public,anon,authenticated;
do $$ declare v_table text; begin
  foreach v_table in array array['posts','order_processes','production_schedules','lots','production_results',
    'lot_process_balance','process_transfer_history','inventory_items','inventory_allocations','shipments',
    'ai_prediction_latest','ai_prediction_results','ai_prediction_input_snapshots','ai_prediction_evaluations',
    'ai_prediction_runs','legacy_post_process_logs_archive'] loop
    execute format('create table test_reset_backup_20261026.%I as table public.%I',v_table,v_table);
  end loop;
end $$;

create temp table reset_master_fingerprints(name text primary key,digest text) on commit drop;
do $$ declare v_table text; v_digest text; begin
  foreach v_table in array array['customer_master','product_master','product_processes','process_master',
    'material_master','line_master','subcontractors','company_calendar','ai_prediction_settings','ai_prediction_reference_starts'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,''[]'')) from public.%I t',v_table) into v_digest;
    insert into reset_master_fingerprints values(v_table,v_digest);
  end loop;
end $$;

delete from ai_prediction_latest;
delete from ai_prediction_evaluations;
delete from ai_prediction_results;
delete from ai_prediction_input_snapshots;
delete from ai_prediction_runs;
delete from legacy_post_process_logs_archive;
delete from shipments;
delete from inventory_allocations;
delete from inventory_items;
delete from process_transfer_history;
delete from lot_process_balance;
update lots set measurement_result_id=null,measurement_order_process_id=null;
delete from production_results;
delete from lots;
delete from production_schedules;
delete from order_processes;
delete from posts;

create temp table reset_plan(order_no text primary key,product_code text,amount integer,remark text) on commit drop;
insert into reset_plan values
 ('T26-001','TEST-P101',100,'未着手・誤登録取消の確認用'),
 ('T26-002','TEST-P101',150,'製造120個完了・メッキ待ち／同製品のグループ表示'),
 ('T26-003','TEST-P102',100,'検査100個・次工程へ移動の確認用'),
 ('T26-004','TEST-P103',100,'計量100個・完了して在庫へ入れる確認用'),
 ('T26-005','TEST-P104',200,'2ロット100個＋95個＝梱包在庫195個（補正5個）'),
 ('T26-006','TEST-P105',100,'30個分納済み・注残70個'),
 ('T26-007','TEST-P105',80,'80個全数出荷済み・注残と進捗の一覧から非表示'),
 ('T26-008','TEST-P102',60,'計量60個・数量編集の確認用'),
 ('T26-009','TEST-P104',50,'10個出荷後の取消済み・在庫50個に復元'),
 ('T26-010','TEST-P103',90,'メッキ外注中90個・戻り確認用');

insert into posts(order_no,product_id,product_code,product_name,customer_id,customer_name,order_amount,
  delivery_date,completion_scheduled_date,remark,"delete",created_at,updated_at)
select r.order_no,p.id,p.product_code,p.product_name,p.customer_id,c.customer_name,r.amount,
  date '2026-11-06'+(right(r.order_no,3)::integer-1),date '2026-11-04'+(right(r.order_no,3)::integer-1),
  r.remark,false,now(),now() from reset_plan r join product_master p using(product_code)
  join customer_master c on c.id=p.customer_id;

insert into order_processes(post_id,order_no,product_id,product_code,product_name,customer_id,customer_name,
  product_process_id,process_name,process_order,planned_amount,completed_amount,subcontractor_id,locked,overlap_days)
select p.id,p.order_no,p.product_id,p.product_code,p.product_name,p.customer_id,p.customer_name,
  pp.id,pp.process_name,pp.process_order,p.order_amount,0,pp.subcontractor_id,false,pp.overlap_days
from posts p join product_processes pp on pp.product_id=p.product_id;

create temp table reset_lots(order_no text,lot_no text,initial_quantity integer,final_quantity integer,target_stage integer) on commit drop;
insert into reset_lots values
 ('T26-002','T26-L002',120,120,2),('T26-003','T26-L003',100,100,3),
 ('T26-004','T26-L004',100,100,4),('T26-005','T26-L005A',100,100,6),
 ('T26-005','T26-L005B',100,95,6),('T26-006','T26-L006',100,100,6),
 ('T26-007','T26-L007',80,80,6),('T26-008','T26-L008',60,60,4),
 ('T26-009','T26-L009',50,50,6),('T26-010','T26-L010',90,90,2);

do $$ declare r record; v_lot uuid; v_process record; v_measure uuid; begin
  for r in select x.*,p.id as post_id,p.product_id,p.product_code,p.product_name,p.customer_id,p.customer_name
    from reset_lots x join posts p using(order_no) order by order_no,lot_no loop
    insert into lots(post_id,order_no,product_id,product_code,product_name,customer_id,customer_name,
      lot_no,material_lot_no,quantity,status,lot_type,note)
    values(r.post_id,r.order_no,r.product_id,r.product_code,r.product_name,r.customer_id,r.customer_name,
      r.lot_no,'T26-MATERIAL',r.initial_quantity,'in_process','normal','2026-10-26動作確認用') returning id into v_lot;
    select * into v_process from order_processes where post_id=r.post_id and process_order=1;
    insert into lot_process_balance(post_id,order_process_id,lot_id,process_name,process_order,quantity)
      values(r.post_id,v_process.id,v_lot,v_process.process_name,1,r.initial_quantity);
    for v_process in select * from order_processes where post_id=r.post_id
      and process_order<least(r.target_stage,4) order by process_order loop
      perform * from transfer_lot_to_next_process(v_lot,v_process.id,r.initial_quantity,'新テストデータの工程実績',
        r.lot_no||':stage:'||v_process.process_order,date '2026-10-12'+(v_process.process_order-1));
    end loop;
    if r.target_stage=6 then
      select id into v_measure from order_processes where post_id=r.post_id and process_order=4;
      perform complete_lot_from_progress(v_lot,v_measure,r.final_quantity,'テスト用の計量・梱包完了（数量補正を含む）',r.lot_no||':complete',date '2026-10-15');
      update lots set measured_amount=r.final_quantity,packaged_amount=r.final_quantity,
        measured_at=date '2026-10-15',packaged_at=date '2026-10-15' where id=v_lot;
    end if;
  end loop;
end $$;

update order_processes set outsource_status='returned',outsource_sent_date=date '2026-10-12',
  outsource_expected_return_date=date '2026-10-13',outsource_returned_date=date '2026-10-13'
  where subcontractor_id is not null and completed_amount>0;
update order_processes set outsource_status='sent',outsource_sent_date=date '2026-10-23',
  outsource_expected_return_date=date '2026-10-28' where order_no='T26-010' and process_order=2;

do $$ declare v_post uuid; v_lot uuid; v_ship shipments%rowtype; begin
  select id into v_post from posts where order_no='T26-006';
  select id into v_lot from lots where lot_no='T26-L006';
  perform register_shipment(v_post,v_lot,30,date '2026-10-26','T26-seed-partial');
  select id into v_post from posts where order_no='T26-007';
  select id into v_lot from lots where lot_no='T26-L007';
  perform register_shipment(v_post,v_lot,80,date '2026-10-26','T26-seed-full');
  select id into v_post from posts where order_no='T26-009';
  select id into v_lot from lots where lot_no='T26-L009';
  v_ship:=register_shipment(v_post,v_lot,10,date '2026-10-26','T26-seed-cancel');
  perform cancel_shipment_and_restore_inventory(v_ship.id,'動作確認用の出荷取消');
end $$;

insert into production_schedules(post_id,order_no,product_id,product_name,customer_id,customer_name,
  press_number,plan_amount,press_completed_amount,press_completed_date,department,shipping_scheduled_start,shipping_scheduled_end)
select p.id,p.order_no,p.product_id,p.product_name,p.customer_id,p.customer_name,
  case d.name when '製造G' then '製造' when '品質管理G' then '検査' else '梱包' end,
  p.order_amount,coalesce(op.completed_amount,0),op.completed_date,d.name,
  p.completion_scheduled_date-4,p.delivery_date from posts p cross join
  (values('製造G',1),('品質管理G',3),('梱包出荷G',5)) d(name,process_order)
  left join order_processes op on op.post_id=p.id and op.process_order=d.process_order;

do $$ declare r record; v_digest text; begin
  if (select count(*) from posts)<>10 or (select count(*) from order_processes)<>50 then
    raise exception 'テストデータ件数が想定と一致しません';
  end if;
  if (select sum(current_stock) from inventory_items where product_code='TEST-P104')<>245 then
    raise exception '梱包在庫195個＋出荷取消復元50個が一致しません';
  end if;
  if (select sum(quantity) from shipments where cancelled is not true)<>110 then
    raise exception '出荷数の合計が一致しません';
  end if;
  for r in select * from reset_master_fingerprints loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,''[]'')) from public.%I t',r.name) into v_digest;
    if v_digest is distinct from r.digest then raise exception 'マスターが変更されました: %',r.name; end if;
  end loop;
end $$;
