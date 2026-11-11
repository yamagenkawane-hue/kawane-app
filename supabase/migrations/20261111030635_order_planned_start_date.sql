-- Keep actual lot identifiers untouched; planned dates have their own typed columns.
begin;
alter table public.posts add column if not exists planned_start_date date;
alter table public.production_schedules add column if not exists planned_start_date date;
comment on column public.posts.planned_start_date is '受注時に入力する製造開始予定日（任意）。ロットNo・実績日とは別項目。';
comment on column public.production_schedules.planned_start_date is '受注に開始予定日がある場合は受注を優先し、それ以外の生産予定の開始日を保持する。';
do $body$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.posts'::regclass and conname='posts_planned_start_dates_check') then
  alter table public.posts add constraint posts_planned_start_dates_check check (
   planned_start_date is null or ((completion_scheduled_date is null or planned_start_date<=completion_scheduled_date)
     and (delivery_date is null or planned_start_date<=delivery_date)));
 end if;
end $body$;

create or replace view public.v_posts_with_master with(security_invoker=true) as
 SELECT original.id,
    original.order_no,
    original.lot_no,
    original.product_code,
    original.product_name,
    original.product_id,
    original.customer_name,
    original.customer_id,
    original.order_amount,
    original.remaining_amount,
    original.completion_scheduled_date,
    original.delivery_date,
    original.shipping_scheduled_start,
    original.shipping_scheduled_end,
    original.remark,
    original.status,
    original.delete,
    original.created_at,
    original.updated_at,
    original.master_product_code,
    original.master_product_name,
    original.master_standard,
    original.master_unit,
    original.master_customer_name,
    original.master_shipping_offset_days,
    p.shipment_closed_at,
    p.planned_start_date
   FROM ( WITH shipment_totals AS (
                 SELECT s.post_id,
                    sum(COALESCE(s.quantity, 0)) AS shipped_amount
                   FROM shipments s
                  GROUP BY s.post_id
                ), latest_process_status AS (
                 SELECT DISTINCT ON (op.post_id) op.post_id,
                    op.process_order,
                        CASE
                            WHEN op.process_name ~~ '%梱包%'::text OR op.process_name ~~ '%包装%'::text THEN
                            CASE
                                WHEN COALESCE(op.planned_amount, 0) > 0 AND COALESCE(op.completed_amount, 0) >= COALESCE(op.planned_amount, 0) THEN '梱包完了'::text
                                ELSE '梱包中'::text
                            END
                            WHEN op.process_name ~~ '%計量%'::text THEN
                            CASE
                                WHEN COALESCE(op.planned_amount, 0) > 0 AND COALESCE(op.completed_amount, 0) >= COALESCE(op.planned_amount, 0) THEN '計量完了'::text
                                ELSE '計量中'::text
                            END
                            WHEN op.process_name ~~ '%検査%'::text THEN
                            CASE
                                WHEN COALESCE(op.planned_amount, 0) > 0 AND COALESCE(op.completed_amount, 0) >= COALESCE(op.planned_amount, 0) THEN '検査完了'::text
                                ELSE '検査中'::text
                            END
                            WHEN op.process_name ~~ '%洗浄%'::text THEN
                            CASE
                                WHEN COALESCE(op.planned_amount, 0) > 0 AND COALESCE(op.completed_amount, 0) >= COALESCE(op.planned_amount, 0) THEN '洗浄完了'::text
                                ELSE '洗浄中'::text
                            END
                            ELSE
                            CASE
                                WHEN COALESCE(op.planned_amount, 0) > 0 AND COALESCE(op.completed_amount, 0) >= COALESCE(op.planned_amount, 0) THEN '製造完了'::text
                                ELSE '製造中'::text
                            END
                        END AS process_status
                   FROM order_processes op
                  WHERE COALESCE(op.completed_amount, 0) > 0
                  ORDER BY op.post_id, op.process_order DESC, op.updated_at DESC NULLS LAST, op.created_at DESC NULLS LAST
                ), active_outsource_processes AS (
                 SELECT op.post_id,
                    op.outsource_status,
                    op.outsource_returned_date,
                    op.planned_amount,
                    op.completed_amount
                   FROM order_processes op
                  WHERE (op.subcontractor_id IS NOT NULL OR op.outsource_sent_date IS NOT NULL OR op.outsource_returned_date IS NOT NULL OR (op.outsource_status = ANY (ARRAY['sent'::text, 'returned'::text]))) AND (op.outsource_sent_date IS NOT NULL OR op.outsource_returned_date IS NOT NULL OR (op.outsource_status = ANY (ARRAY['sent'::text, 'returned'::text])) OR COALESCE(op.planned_amount, 0) > 0 AND COALESCE(op.completed_amount, 0) >= COALESCE(op.planned_amount, 0))
                ), outsource_statuses AS (
                 SELECT aop.post_id,
                    bool_or(aop.outsource_status = 'returned'::text OR aop.outsource_returned_date IS NOT NULL OR COALESCE(aop.planned_amount, 0) > 0 AND COALESCE(aop.completed_amount, 0) >= COALESCE(aop.planned_amount, 0)) AS has_returned,
                    true AS has_outsource
                   FROM active_outsource_processes aop
                  GROUP BY aop.post_id
                )
         SELECT p_1.id,
            p_1.order_no,
            p_1.lot_no,
            COALESCE(pm.product_code, p_1.product_code) AS product_code,
            COALESCE(pm.product_name, p_1.product_name) AS product_name,
            p_1.product_id,
            COALESCE(cm.customer_name, p_1.customer_name) AS customer_name,
            p_1.customer_id,
            p_1.order_amount,
            p_1.order_amount AS remaining_amount,
            p_1.completion_scheduled_date,
            p_1.delivery_date,
            p_1.shipping_scheduled_start,
            p_1.shipping_scheduled_end,
            p_1.remark,
                CASE
                    WHEN COALESCE(st.shipped_amount, 0::bigint) >= COALESCE(p_1.order_amount, 0::bigint) AND COALESCE(p_1.order_amount, 0::bigint) > 0 THEN '出荷OK'::text
                    WHEN COALESCE(os.has_outsource, false) AND COALESCE(os.has_returned, false) THEN '外注済'::text
                    WHEN COALESCE(os.has_outsource, false) THEN '外注'::text
                    WHEN lps.process_status IS NOT NULL THEN lps.process_status
                    ELSE COALESCE(NULLIF(p_1.status, ''::text), '未着手'::text)
                END AS status,
            p_1.delete,
            p_1.created_at,
            p_1.updated_at,
            pm.product_code AS master_product_code,
            pm.product_name AS master_product_name,
            pm.standard AS master_standard,
            pm.unit AS master_unit,
            cm.customer_name AS master_customer_name,
            cm.shipping_offset_days AS master_shipping_offset_days
           FROM posts p_1
             LEFT JOIN product_master pm ON pm.id = p_1.product_id
             LEFT JOIN customer_master cm ON cm.id = p_1.customer_id
             LEFT JOIN shipment_totals st ON st.post_id = p_1.id
             LEFT JOIN latest_process_status lps ON lps.post_id = p_1.id
             LEFT JOIN outsource_statuses os ON os.post_id = p_1.id) original
     JOIN posts p ON p.id = original.id;

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
    COALESCE(pm.plan_amount, 0) AS product_plan_amount,
    coalesce(p.planned_start_date,ps.planned_start_date) AS planned_start_date
   FROM production_schedules ps
     LEFT JOIN posts p ON p.id = ps.post_id
     LEFT JOIN product_master pm ON pm.id = COALESCE(ps.product_id, p.product_id)
     LEFT JOIN customer_master cm ON cm.id = COALESCE(ps.customer_id, p.customer_id);

-- Adding a NULL-only field must not invalidate previously downloaded v1 archives.
-- Non-NULL dates are included and therefore remain covered by the existing digest/anchor checks.
create or replace function app_private.history_packet(p_post uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'post_id',p_post,'anchors',jsonb_build_object(
  'post',(select (to_jsonb(p)-'planned_start_date') || case when p.planned_start_date is null then '{}'::jsonb else jsonb_build_object('planned_start_date',p.planned_start_date) end from public.posts p where id=p_post),
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

commit;
