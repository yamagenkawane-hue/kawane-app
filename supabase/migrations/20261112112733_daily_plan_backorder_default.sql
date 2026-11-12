-- Default only. Preserve explicit per-order overrides, including zero.
begin;
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
    COALESCE(ps.production_plan_amount,
      CASE WHEN p.id IS NOT NULL THEN
        GREATEST(COALESCE(p.order_amount,0)-COALESCE(shipment_totals.shipped_amount,0),0)::integer
      ELSE ps.plan_amount END,0) AS product_plan_amount,
    coalesce(p.planned_start_date,ps.planned_start_date) AS planned_start_date
   FROM production_schedules ps
     LEFT JOIN posts p ON p.id = ps.post_id
     LEFT JOIN product_master pm ON pm.id = COALESCE(ps.product_id, p.product_id)
     LEFT JOIN customer_master cm ON cm.id = COALESCE(ps.customer_id, p.customer_id)
     LEFT JOIN (SELECT post_id,sum(quantity) AS shipped_amount FROM public.shipments
       WHERE cancelled IS NOT TRUE GROUP BY post_id) shipment_totals ON shipment_totals.post_id=p.id;

notify pgrst,'reload schema';
commit;
