create table if not exists inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id) on delete set null,
  product_code text not null,
  lot_no text not null,
  allocated_amount integer not null check (allocated_amount > 0),
  confirmed_at timestamptz not null default now()
);

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

  select coalesce(sum((log_item->>'amount')::integer), 0)
    into v_completed
    from jsonb_array_elements(coalesce(v_post.packaging_logs, '[]'::jsonb)) as log_item;

  v_remaining := greatest(coalesce(v_post.order_amount, 0) - v_completed, 0);

  if v_remaining <= 0 then
    raise exception '注残がないため在庫引当できません';
  end if;

  for v_inventory in
    select *
      from inventory_items
     where product_code = v_post.product_code
       and current_stock > 0
     order by updated_at asc, lot_no asc
     for update
  loop
    exit when v_remaining <= 0;

    v_allocate := least(v_remaining, v_inventory.current_stock);

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

    if v_inventory.current_stock - v_allocate <= 0 then
      delete from inventory_items where id = v_inventory.id;
    else
      update inventory_items
         set current_stock = current_stock - v_allocate,
             updated_at = now()
       where id = v_inventory.id;
    end if;

    v_remaining := v_remaining - v_allocate;
    v_allocated_total := v_allocated_total + v_allocate;
  end loop;

  if v_allocated_total <= 0 then
    raise exception '引当可能な在庫がありません';
  end if;
end;
$$ language plpgsql;
