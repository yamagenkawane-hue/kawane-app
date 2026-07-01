-- Keep order_processes.process_order gapless even when product_processes has
-- gaps such as 1, 3. Screens and result allowance logic expect each order's
-- process sequence to be 1, 2, 3...

create or replace function create_order_processes_for_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into order_processes (
    post_id,
    order_no,
    product_id,
    customer_id,
    product_process_id,
    product_code,
    product_name,
    customer_name,
    process_name,
    process_order,
    planned_amount,
    subcontractor_id
  )
  with target_post as (
    select
      p.id,
      p.order_no,
      p.product_id,
      p.customer_id,
      p.product_code,
      p.product_name,
      p.customer_name,
      p.order_amount,
      pm.id as master_product_id,
      pm.product_code as master_product_code,
      pm.product_name as master_product_name,
      cm.id as master_customer_id,
      cm.customer_name as master_customer_name
    from posts p
    left join product_master pm
      on pm.id = p.product_id
      or pm.product_code = p.product_code
    left join customer_master cm
      on cm.id = p.customer_id
      or cm.customer_name = p.customer_name
    where p.id = p_post_id
  ), selected_master_processes as (
    select distinct on (pp.process_order)
      pp.id,
      pp.product_id,
      pp.product_code,
      pp.process_name,
      pp.process_order,
      pp.subcontractor_id,
      pp.updated_at,
      pp.created_at
    from target_post tp
    join product_processes pp
      on (
        pp.product_id = coalesce(tp.product_id, tp.master_product_id)
        or pp.product_code = coalesce(tp.master_product_code, tp.product_code)
      )
    order by pp.process_order, pp.updated_at desc nulls last, pp.created_at desc nulls last
  ), normalized_master_processes as (
    select
      smp.*,
      row_number() over (
        order by smp.process_order, smp.updated_at desc nulls last, smp.created_at desc nulls last
      )::integer as normalized_process_order
    from selected_master_processes smp
  )
  select
    tp.id,
    tp.order_no,
    coalesce(tp.product_id, tp.master_product_id),
    coalesce(tp.customer_id, tp.master_customer_id),
    nmp.id,
    coalesce(tp.master_product_code, tp.product_code),
    coalesce(tp.master_product_name, tp.product_name),
    coalesce(tp.master_customer_name, tp.customer_name),
    nmp.process_name,
    nmp.normalized_process_order,
    coalesce(tp.order_amount, 0),
    nmp.subcontractor_id
  from target_post tp
  join normalized_master_processes nmp on true
  where not exists (
    select 1
    from order_processes op
    where op.post_id = tp.id
      and (
        op.product_process_id = nmp.id
        or op.process_order = nmp.normalized_process_order
      )
  )
  order by nmp.normalized_process_order;
end;
$$;

grant execute on function create_order_processes_for_post(uuid) to anon, authenticated;

create or replace function normalize_order_process_sequence_for_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  temp_base integer := 100000;
begin
  perform 1
  from order_processes
  where post_id = p_post_id
  for update;

  with ranked as (
    select
      id,
      row_number() over (
        order by process_order, updated_at desc nulls last, created_at desc nulls last, id
      )::integer as next_process_order
    from order_processes
    where post_id = p_post_id
  )
  update order_processes op
  set process_order = temp_base + ranked.next_process_order,
      updated_at = now()
  from ranked
  where op.id = ranked.id;

  with ranked as (
    select
      id,
      row_number() over (
        order by process_order, updated_at desc nulls last, created_at desc nulls last, id
      )::integer as next_process_order
    from order_processes
    where post_id = p_post_id
  )
  update order_processes op
  set process_order = ranked.next_process_order,
      updated_at = now()
  from ranked
  where op.id = ranked.id;
end;
$$;

grant execute on function normalize_order_process_sequence_for_post(uuid) to anon, authenticated;
