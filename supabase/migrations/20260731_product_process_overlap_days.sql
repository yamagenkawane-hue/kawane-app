-- Add overlap days to product processes and propagate it to order processes
-- for Gantt chart scheduling where adjacent processes can run in parallel.

alter table product_processes
  add column if not exists overlap_days integer not null default 0;

alter table order_processes
  add column if not exists overlap_days integer not null default 0;

update product_processes
set overlap_days = 0
where overlap_days is null or overlap_days < 0;

update order_processes
set overlap_days = 0
where overlap_days is null or overlap_days < 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_processes_overlap_days_non_negative_chk'
  ) then
    alter table product_processes
      add constraint product_processes_overlap_days_non_negative_chk
      check (overlap_days >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_processes_overlap_days_non_negative_chk'
  ) then
    alter table order_processes
      add constraint order_processes_overlap_days_non_negative_chk
      check (overlap_days >= 0) not valid;
  end if;
end;
$$;

update order_processes op
set overlap_days = coalesce(pp.overlap_days, 0),
    updated_at = now()
from product_processes pp
where pp.id = op.product_process_id
  and coalesce(op.overlap_days, 0) <> coalesce(pp.overlap_days, 0);

create or replace view v_product_processes_with_master as
select
  pp.id,
  pp.product_id,
  coalesce(pm.product_code, pp.product_code) as product_code,
  pm.product_name,
  pm.customer_id,
  cm.customer_name,
  pp.process_master_id,
  coalesce(pr.process_id, pp.process_name) as process_id,
  coalesce(pr.name, pp.process_name) as process_name,
  pp.process_order,
  pr.days,
  coalesce(pr.enabled, true) as enabled,
  coalesce(pr.outsourcing, false) as outsourcing,
  pp.subcontractor_id,
  sc.name as subcontractor_name,
  pp.created_at,
  pp.updated_at,
  coalesce(pp.overlap_days, 0) as overlap_days
from product_processes pp
left join product_master pm
  on pm.id = pp.product_id
left join customer_master cm
  on cm.id = pm.customer_id
left join process_master pr
  on pr.id = pp.process_master_id
left join subcontractors sc
  on sc.id = pp.subcontractor_id;

create or replace view v_order_processes_with_master as
select
  op.id,
  op.post_id,
  p.order_no,
  op.product_id,
  coalesce(pm.product_code, op.product_code, p.product_code) as product_code,
  coalesce(pm.product_name, op.product_name, p.product_name) as product_name,
  op.customer_id,
  coalesce(cm.customer_name, op.customer_name, p.customer_name) as customer_name,
  op.product_process_id,
  op.process_name,
  op.process_order,
  op.planned_amount,
  op.completed_amount,
  greatest(op.planned_amount - op.completed_amount, 0) as remaining_amount,
  case
    when op.planned_amount <= 0 then 0
    else round((op.completed_amount::numeric / op.planned_amount::numeric) * 100, 1)
  end as progress_rate,
  op.completed_date,
  op.subcontractor_id,
  sc.name as subcontractor_name,
  op.locked,
  p.delivery_date,
  p.completion_scheduled_date,
  op.created_at,
  op.updated_at,
  op.outsource_sent_date,
  op.outsource_expected_return_date,
  op.outsource_returned_date,
  op.outsource_status,
  op.outsource_note,
  coalesce(op.overlap_days, 0) as overlap_days
from order_processes op
left join posts p
  on p.id = op.post_id
left join product_master pm
  on pm.id = op.product_id
left join customer_master cm
  on cm.id = op.customer_id
left join subcontractors sc
  on sc.id = op.subcontractor_id;

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
    subcontractor_id,
    overlap_days
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
      coalesce(pp.overlap_days, 0) as overlap_days,
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
    nmp.subcontractor_id,
    nmp.overlap_days
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

create or replace function sync_order_processes_from_product_master(
  p_post_id uuid
) returns table (
  inserted_count integer,
  updated_count integer,
  skipped_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post posts%rowtype;
  master_process record;
  existing_process order_processes%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  select *
  into target_post
  from posts
  where id = p_post_id
  for update;

  if not found then
    raise exception '受注データが見つかりません';
  end if;

  if not exists (
    select 1
    from product_processes pp
    where (
      (target_post.product_id is not null and pp.product_id = target_post.product_id)
      or pp.product_code = target_post.product_code
    )
  ) then
    raise exception 'この製品の製品工程マスタが登録されていません';
  end if;

  for master_process in
    select distinct on (pp.process_order)
      pp.id,
      pp.product_id,
      pp.product_code,
      pp.process_name,
      pp.process_order,
      pp.subcontractor_id,
      coalesce(pp.overlap_days, 0) as overlap_days
    from product_processes pp
    where (
      (target_post.product_id is not null and pp.product_id = target_post.product_id)
      or pp.product_code = target_post.product_code
    )
    order by pp.process_order, pp.updated_at desc nulls last, pp.created_at desc nulls last
  loop
    select *
    into existing_process
    from order_processes op
    where op.post_id = p_post_id
      and op.process_order = master_process.process_order
    limit 1
    for update;

    if not found then
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
        subcontractor_id,
        overlap_days,
        completed_amount,
        locked
      ) values (
        target_post.id,
        target_post.order_no,
        coalesce(target_post.product_id, master_process.product_id),
        target_post.customer_id,
        master_process.id,
        coalesce(target_post.product_code, master_process.product_code),
        target_post.product_name,
        target_post.customer_name,
        master_process.process_name,
        master_process.process_order,
        coalesce(target_post.order_amount, 0),
        master_process.subcontractor_id,
        master_process.overlap_days,
        0,
        false
      );

      v_inserted := v_inserted + 1;
      continue;
    end if;

    if coalesce(existing_process.completed_amount, 0) > 0
       or coalesce(existing_process.locked, false) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update order_processes
    set product_process_id = master_process.id,
        process_name = master_process.process_name,
        planned_amount = coalesce(target_post.order_amount, 0),
        subcontractor_id = master_process.subcontractor_id,
        overlap_days = master_process.overlap_days,
        updated_at = now()
    where id = existing_process.id;

    v_updated := v_updated + 1;
  end loop;

  inserted_count := v_inserted;
  updated_count := v_updated;
  skipped_count := v_skipped;
  return next;
end;
$$;

revoke all on function sync_order_processes_from_product_master(uuid) from public;
grant execute on function sync_order_processes_from_product_master(uuid) to anon, authenticated;
