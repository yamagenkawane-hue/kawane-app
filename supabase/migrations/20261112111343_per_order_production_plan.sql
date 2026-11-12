-- Per-order override only; original order quantities and master defaults stay intact.
begin;
alter table public.production_schedules add column production_plan_amount integer check(production_plan_amount>=0);
comment on column public.production_schedules.production_plan_amount is '受注別の計画数。未設定時は製品マスタの計画数を使用。';
drop function public.save_daily_department_dates(uuid,date,date,date);
create or replace function public.save_daily_department_dates(p_post_id uuid,p_manufacturing_date date,p_quality_date date,p_shipping_date date,p_plan_amount integer default null)
returns void language plpgsql security definer set search_path='' as $body$
declare p public.posts; s public.production_schedules; d text; finish date; i integer; remaining integer;
 departments text[]:=array['製造G','品質管理G','梱包出荷G']; dates date[]:=array[p_manufacturing_date,p_quality_date,p_shipping_date];
begin
 perform app_private.assert_access(false);
 if p_plan_amount<0 then raise exception '計画数は0以上の整数で指定してください' using errcode='22023'; end if;
 select * into p from public.posts where id=p_post_id for update;
 if not found or p."delete" is true or p.shipment_closed_at is not null then raise exception '有効な注番が見つかりません'; end if;
 select greatest(coalesce(p.order_amount,0)-coalesce(sum(quantity),0),0)::integer into remaining
 from public.shipments where post_id=p.id and cancelled=false;
 for i in 1..3 loop
  d:=departments[i]; finish:=dates[i];
  select * into s from public.production_schedules where (post_id=p.id or (post_id is null and order_no=p.order_no))
    and coalesce(department,'製造G')=d order by created_at desc,id limit 1 for update;
  if found then
    update public.production_schedules set press_completed_date=finish,
      production_plan_amount=case when i=1 and p_plan_amount is not null then p_plan_amount else production_plan_amount end,
      shipping_scheduled_end=coalesce(p.delivery_date,s.shipping_scheduled_end),updated_at=now() where id=s.id;
  elsif finish is not null or (i=1 and p_plan_amount is not null) then
    insert into public.production_schedules(post_id,order_no,customer_name,product_name,product_id,customer_id,
      press_number,lot_no,planned_start_date,production_plan_amount,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_end,department,updated_at)
    values(p.id,p.order_no,p.customer_name,p.product_name,p.product_id,p.customer_id,
      '',coalesce(p.lot_no,''),p.planned_start_date,case when i=1 then p_plan_amount end,remaining,0,finish,p.delivery_date,d,now());
  end if;
 end loop;
end $body$;
revoke all on function public.save_daily_department_dates(uuid,date,date,date,integer) from public,anon;
grant execute on function public.save_daily_department_dates(uuid,date,date,date,integer) to authenticated,service_role;

create or replace view public.v_production_schedules_with_master with(security_invoker=true) as
 SELECT ps.id,
    ps.post_id,
    COALESCE(p.order_no, ps.order_no) AS order_no,
    ps.product_id,
    COALESCE(pm.product_code, p.product_code, ps.press_number) AS product_code,
    COALESCE(pm.product_name, ps.product_name, p.product_name) AS product_name,
    ps.customer_id,
    COALESCE(cm.customer_name, ps.customer_name, p.customer_name) AS customer_name,
    ps.press_number,
    ps.lot_no,
    ps.plan_amount,
    ps.press_completed_amount,
    GREATEST(ps.plan_amount - ps.press_completed_amount, 0) AS remaining_amount,
    ps.press_completed_date,
    ps.shipping_scheduled_start,
    ps.shipping_scheduled_end,
    COALESCE(p.delivery_date, ps.shipping_scheduled_end) AS delivery_date,
    ps.created_at,
    ps.updated_at,
    ps.department,
    COALESCE(ps.production_plan_amount, pm.plan_amount, 0) AS product_plan_amount,
    coalesce(p.planned_start_date,ps.planned_start_date) AS planned_start_date
   FROM production_schedules ps
     LEFT JOIN posts p ON p.id = ps.post_id
     LEFT JOIN product_master pm ON pm.id = COALESCE(ps.product_id, p.product_id)
     LEFT JOIN customer_master cm ON cm.id = COALESCE(ps.customer_id, p.customer_id);

notify pgrst,'reload schema';
commit;
