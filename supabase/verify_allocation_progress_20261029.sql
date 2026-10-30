-- Verify the live guard with synthetic records; keep all changes uncommitted and roll back.
begin;
do $$ declare
  v_product record;
  v_started uuid:=gen_random_uuid();
  v_unstarted uuid:=gen_random_uuid();
  v_blocked boolean:=false;
begin
  select pm.*,cm.customer_name as resolved_customer_name into v_product from product_master pm
    left join customer_master cm on cm.id=pm.customer_id order by pm.id limit 1;
  if v_product.id is null then raise exception '検証用の製品マスターがありません'; end if;
  insert into posts(id,order_no,product_id,product_code,product_name,customer_id,customer_name,order_amount,"delete")
    values(v_started,'VERIFY-PROGRESS-'||v_started::text,v_product.id,v_product.product_code,v_product.product_name,
      v_product.customer_id,coalesce(v_product.resolved_customer_name,''),100,false),
    (v_unstarted,'VERIFY-UNSTARTED-'||v_unstarted::text,v_product.id,v_product.product_code,v_product.product_name,
      v_product.customer_id,coalesce(v_product.resolved_customer_name,''),100,false);
  insert into order_processes(post_id,order_no,product_id,product_code,product_name,customer_id,customer_name,
    process_name,process_order,planned_amount,completed_amount)
  select id,order_no,product_id,product_code,product_name,customer_id,customer_name,'製造',1,100,
    case when id=v_started then 1 else 0 end from posts where id in(v_started,v_unstarted);
  if not public.order_has_process_progress(v_started) then raise exception '1%%進捗を検出できません'; end if;
  if public.order_has_process_progress(v_unstarted) then raise exception '予定だけの受注が進捗ありと判定されました'; end if;
  begin
    perform public.confirm_inventory_allocation(v_started);
  exception when raise_exception then
    if sqlerrm not like '%工程進捗%' then raise; end if;
    v_blocked:=true;
  end;
  if not v_blocked then raise exception '進捗ありの受注を引当できてしまいました'; end if;
  if exists(select 1 from inventory_allocations where post_id=v_started) then raise exception '拒否した受注に引当が作成されました'; end if;
  -- Reproduce a screen that was loaded while the order was unstarted.
  insert into production_results(post_id,process_id,process_name,date,amount)
    values(v_unstarted,'manufacturing','製造',(now() at time zone 'Asia/Tokyo')::date,1);
  v_blocked:=false;
  begin
    perform public.confirm_inventory_allocation(v_unstarted);
  exception when raise_exception then
    if sqlerrm not like '%工程進捗%' then raise; end if;
    v_blocked:=true;
  end;
  if not v_blocked then raise exception '画面表示後の実績登録を検出できません'; end if;
end $$;
select 'passed: 1% progress blocks allocation; plan-only order allowed by eligibility; stale-screen allocation blocked; no allocations inserted' as verification;
rollback;
