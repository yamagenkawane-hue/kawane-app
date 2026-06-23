-- Remove legacy per-post JSON process logs after the application has moved to
-- order_processes and production_results.

create table if not exists legacy_post_process_logs_archive (
  post_id uuid primary key,
  order_no text,
  product_code text,
  product_name text,
  customer_name text,
  manufacturing_logs jsonb not null default '[]'::jsonb,
  cleaning_logs jsonb not null default '[]'::jsonb,
  inspection_logs jsonb not null default '[]'::jsonb,
  measurement_logs jsonb not null default '[]'::jsonb,
  packaging_logs jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now()
);

insert into legacy_post_process_logs_archive (
  post_id,
  order_no,
  product_code,
  product_name,
  customer_name,
  manufacturing_logs,
  cleaning_logs,
  inspection_logs,
  measurement_logs,
  packaging_logs,
  archived_at
)
select
  id,
  order_no,
  product_code,
  product_name,
  customer_name,
  coalesce(manufacturing_logs::jsonb, '[]'::jsonb),
  coalesce(cleaning_logs::jsonb, '[]'::jsonb),
  coalesce(inspection_logs::jsonb, '[]'::jsonb),
  coalesce(measurement_logs::jsonb, '[]'::jsonb),
  coalesce(packaging_logs::jsonb, '[]'::jsonb),
  now()
from posts
where jsonb_array_length(coalesce(manufacturing_logs::jsonb, '[]'::jsonb)) > 0
   or jsonb_array_length(coalesce(cleaning_logs::jsonb, '[]'::jsonb)) > 0
   or jsonb_array_length(coalesce(inspection_logs::jsonb, '[]'::jsonb)) > 0
   or jsonb_array_length(coalesce(measurement_logs::jsonb, '[]'::jsonb)) > 0
   or jsonb_array_length(coalesce(packaging_logs::jsonb, '[]'::jsonb)) > 0
on conflict (post_id) do update set
  order_no = excluded.order_no,
  product_code = excluded.product_code,
  product_name = excluded.product_name,
  customer_name = excluded.customer_name,
  manufacturing_logs = excluded.manufacturing_logs,
  cleaning_logs = excluded.cleaning_logs,
  inspection_logs = excluded.inspection_logs,
  measurement_logs = excluded.measurement_logs,
  packaging_logs = excluded.packaging_logs,
  archived_at = excluded.archived_at;

create or replace function confirm_inventory_allocation(
  p_post_id uuid
) returns void as $$
declare
  v_post record;
  v_completed integer := 0;
  v_remaining integer := 0;
  v_allocate integer := 0;
  v_allocated_total integer := 0;
  v_inventory record;
begin
  if exists (
    select 1 from inventory_allocations where post_id = p_post_id
  ) then
    raise exception 'この注番はすでに在庫引当が確定済みです';
  end if;

  select *
    into v_post
    from posts
   where id = p_post_id
   for update;

  if not found then
    raise exception '受注データが見つかりません';
  end if;

  select greatest(
    coalesce((
      select op.completed_amount
        from order_processes op
       where op.post_id = p_post_id
       order by op.process_order desc
       limit 1
    ), 0),
    coalesce((
      select sum(pr.amount)::integer
        from production_results pr
       where pr.post_id = p_post_id
         and (
           pr.process_id = 'packaging'
           or pr.process_name = '梱包'
         )
    ), 0)
  ) into v_completed;

  v_remaining := greatest(coalesce(v_post.order_amount, 0) - v_completed, 0);

  if v_remaining <= 0 then
    raise exception '注残がないため在庫引当できません';
  end if;

  for v_inventory in
    select *
      from inventory_items
     where product_code = v_post.product_code
       and greatest(current_stock - coalesce(allocated_stock, 0), 0) > 0
     order by updated_at asc, lot_no asc
     for update
  loop
    exit when v_remaining <= 0;

    v_allocate := least(
      v_remaining,
      greatest(
        v_inventory.current_stock - coalesce(v_inventory.allocated_stock, 0),
        0
      )
    );

    insert into inventory_allocations (
      post_id,
      inventory_item_id,
      product_code,
      lot_no,
      allocated_amount
    ) values (
      p_post_id,
      v_inventory.id,
      v_inventory.product_code,
      v_inventory.lot_no,
      v_allocate
    );

    update inventory_items
       set allocated_stock = coalesce(allocated_stock, 0) + v_allocate,
           updated_at = now()
     where id = v_inventory.id;

    v_remaining := v_remaining - v_allocate;
    v_allocated_total := v_allocated_total + v_allocate;
  end loop;

  if v_allocated_total <= 0 then
    raise exception '引当可能な在庫がありません';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function confirm_inventory_allocation(uuid) to anon, authenticated;

drop view if exists v_posts_with_master;

alter table posts
  drop column if exists manufacturing_logs,
  drop column if exists cleaning_logs,
  drop column if exists inspection_logs,
  drop column if exists measurement_logs,
  drop column if exists packaging_logs;

create or replace view v_posts_with_master as
select
  p.id,
  p.order_no,
  p.lot_no,
  p.product_code,
  p.product_name,
  p.product_id,
  p.customer_name,
  p.customer_id,
  p.order_amount,
  p.order_amount as remaining_amount,
  p.completion_scheduled_date,
  p.manufacturing_date,
  p.cleaning_date,
  p.inspection_date,
  p.measurement_date,
  p.packaging_date,
  p.delivery_date,
  p.remark,
  p.status,
  p.delete,
  p.created_at,
  p.updated_at,
  pm.product_code as master_product_code,
  pm.product_name as master_product_name,
  pm.standard as master_standard,
  pm.unit as master_unit,
  cm.customer_name as master_customer_name,
  cm.shipping_offset_days as master_shipping_offset_days
from posts p
left join product_master pm
  on pm.id = p.product_id
left join customer_master cm
  on cm.id = p.customer_id;