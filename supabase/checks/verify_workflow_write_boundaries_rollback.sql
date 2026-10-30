-- 承認済みプロジェクトのみで実行。既存Authセッションを使うSQLロール模擬であり、ブラウザーログイン検証ではない。
-- アカウント・セッションを作成せず、業務テスト行は必ず最後にROLLBACKする。
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare
  worker_claims text; admin_claims text; identity_claims text;
  p uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
  untouched uuid:=gen_random_uuid(); sid uuid; sid2 uuid;
  tag text:='KAWANE-AUTH-VERIFY-20261030-0938-'||gen_random_uuid()::text;
  checks integer:=0; sql_text text; is_admin boolean;
begin
  select jsonb_build_object('sub',p.id,'session_id',s.id,'role','authenticated')::text into worker_claims
    from public.app_profiles p join auth.sessions s on s.user_id=p.id where p.active and not p.manager limit 1;
  select jsonb_build_object('sub',p.id,'session_id',s.id,'role','authenticated')::text into admin_claims
    from public.app_profiles p join auth.sessions s on s.user_id=p.id where p.active and p.manager limit 1;
  if worker_claims is null or admin_claims is null then raise exception '既存の一般・管理者セッションが必要です（作成しません）'; end if;
  insert into public.posts(id,order_no,product_code,product_name,customer_name,order_amount,delivery_date,remark)
    values(p,tag,tag,tag,tag,100,current_date,'bounded synthetic verification'),(untouched,tag||'-cancel',tag,tag,tag,10,current_date,'bounded synthetic verification');
  insert into public.lots(id,post_id,lot_no,product_code,product_name,customer_name,quantity,inventory_amount)
    values(l,p,tag,tag,tag,tag,120,120);
  insert into public.inventory_items(id,lot_id,product_code,product_name,lot_no,current_stock,allocated_stock)
    values(i,l,tag,tag,tag,120,20);
  insert into public.inventory_allocations(id,post_id,inventory_item_id,lot_id,product_code,lot_no,allocated_amount)
    values(a,p,i,l,tag,tag,20);

  foreach identity_claims in array array[worker_claims,admin_claims] loop
    perform set_config('request.jwt.claims',identity_claims,true);
    execute 'set local role authenticated';
    is_admin:=identity_claims=admin_claims;
    if not app_private.is_member(false) or app_private.is_member(true)<>is_admin then raise exception 'ロール模擬の事前条件が不一致'; end if; checks:=checks+1;
    foreach sql_text in array array[
      format('update public.posts set "delete"=true where id=%L',p),
      format('update public.lots set deleted=true where id=%L',l),
      format('update public.lots set deleted_at=now() where id=%L',l),
      format('update public.lots set deleted_reason=''forged'' where id=%L',l),
      format('delete from public.posts where id=%L',p),
      format('insert into public.shipments(post_id,order_no,product_name,customer_name,lot_id,lot_no,scheduled_date,quantity) values(%L,%L,%L,%L,%L,%L,current_date,1)',p,tag,tag,tag,l,tag),
      format('update public.shipments set cancelled=true where post_id=%L',p),
      format('delete from public.shipments where post_id=%L',p),
      format('select public.ship_inventory_for_post(%L,1)',p),
      format('insert into public.lots(post_id,lot_no,product_name,customer_name,deleted) values(%L,%L,%L,%L,true)',p,tag||'-forged',tag,tag),
      format('insert into public.lots(post_id,lot_no,product_name,customer_name,deleted_reason) values(%L,%L,%L,%L,''forged'')',p,tag||'-forged',tag,tag)
    ] loop
      begin execute sql_text; raise exception '拒否されるべき直接操作が成功: %',sql_text;
      exception when insufficient_privilege then checks:=checks+1; end;
    end loop;
    update public.posts set remark='normal-edit-verified' where id=p;
    if not found then raise exception '通常編集が拒否された'; end if; checks:=checks+1;
    update public.lots set quantity=120 where id=l;
    if not found then raise exception '通常ロット編集が拒否された'; end if; checks:=checks+1;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claims',worker_claims,true); execute 'set local role authenticated';
  foreach sql_text in array array[
    format('select public.soft_delete_lot(%L)',l),format('select public.restore_deleted_lot(%L)',l),
    format('select public.soft_delete_order_post(%L)',untouched),
    format('select public.cancel_shipment_and_restore_inventory(%L,''worker forbidden'')',gen_random_uuid()),
    format('insert into public.posts(order_no) values(%L)',tag||'-worker-post')
  ] loop
    begin execute sql_text; raise exception '一般利用者の管理操作が成功';
    exception when insufficient_privilege then checks:=checks+1; end;
  end loop;
  insert into public.lots(post_id,lot_no,product_code,product_name,customer_name)
    values(p,tag||'-worker-lot',tag,tag,tag); checks:=checks+1;
  begin perform public.register_shipment(p,l,0,current_date,tag||'-invalid'); raise exception '数量検証がない';
  exception when raise_exception then if sqlerrm not like '%出荷数量%' then raise; end if; checks:=checks+1; end;
  begin perform public.register_shipment(p,l,101,current_date,tag||'-over'); raise exception '注残検証がない';
  exception when raise_exception then if sqlerrm not like '%注残%' then raise; end if; checks:=checks+1; end;
  select id into sid from public.register_shipment(p,l,30,current_date,tag||'-ship');
  select id into sid2 from public.register_shipment(p,l,30,current_date,tag||'-ship');
  if sid<>sid2 then raise exception '出荷二重登録'; end if; checks:=checks+1;
  if (select current_stock from public.inventory_items where id=i)<>90 then raise exception '出荷在庫が不一致'; end if; checks:=checks+1;
  if (select shipped_amount from public.inventory_allocations where id=a)<>20 then raise exception '引当消費が不一致'; end if; checks:=checks+1;
  begin perform public.cancel_shipment_and_restore_inventory(sid,'worker forbidden'); raise exception '一般利用者取消が成功';
  exception when insufficient_privilege then checks:=checks+1; end;
  execute 'reset role';

  perform set_config('request.jwt.claims',admin_claims,true); execute 'set local role authenticated';
  insert into public.posts(order_no,product_code,product_name,customer_name,"delete") values(tag||'-admin-post',tag,tag,tag,false); checks:=checks+1;
  begin insert into public.posts(order_no,"delete") values(tag||'-forged-post',true); raise exception '取消受注の直接作成が成功';
  exception when insufficient_privilege then checks:=checks+1; end;
  perform public.cancel_shipment_and_restore_inventory(sid,'rollback verification');
  if not (select cancelled from public.shipments where id=sid) then raise exception '取消未反映'; end if; checks:=checks+1;
  if (select current_stock from public.inventory_items where id=i)<>120 or (select allocated_stock from public.inventory_items where id=i)<>20 then raise exception '在庫復元が不一致'; end if; checks:=checks+1;
  if (select shipped_amount from public.inventory_allocations where id=a)<>0 then raise exception '引当復元が不一致'; end if; checks:=checks+1;
  perform public.cancel_shipment_and_restore_inventory(sid,'repeat verification');
  if (select current_stock from public.inventory_items where id=i)<>120 then raise exception '二重取消で在庫増加'; end if; checks:=checks+1;
  perform public.soft_delete_lot(l);
  if not (select deleted and deleted_at is not null from public.lots where id=l) then raise exception 'ロット削除未反映'; end if; checks:=checks+1;
  perform public.restore_deleted_lot(l);
  if not (select not deleted and deleted_at is null and deleted_reason is null from public.lots where id=l) then raise exception 'ロット復元未反映'; end if; checks:=checks+1;
  perform public.soft_delete_order_post(untouched);
  if not (select "delete" from public.posts where id=untouched) then raise exception '受注取消未反映'; end if; checks:=checks+1;
  execute 'reset role';

  perform set_config('request.jwt.claims',(worker_claims::jsonb||jsonb_build_object('session_id',gen_random_uuid()))::text,true);
  execute 'set local role authenticated';
  if app_private.is_member(false) then raise exception '存在しないセッションを許可'; end if; checks:=checks+1;
  begin perform public.register_shipment(p,l,1,current_date,tag||'-expired'); raise exception '存在しないセッションで出荷';
  exception when insufficient_privilege then checks:=checks+1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);execute 'set local role anon';
  begin perform 1 from public.posts where id=p; raise exception '未認証読取が成功';
  exception when insufficient_privilege then checks:=checks+1; end;
  execute 'reset role';
  perform set_config('kawane_test.result',jsonb_build_object('mode','live database SQL role simulation; all test writes rolled back','passed',checks,'marker',tag,'auth_accounts_created',0,'auth_sessions_created',0)::text,true);
end $$;
select current_setting('kawane_test.result')::jsonb as verification;
rollback;
