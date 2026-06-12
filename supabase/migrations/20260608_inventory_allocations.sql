create table if not exists inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id) on delete set null,
  product_code text not null,
  lot_no text not null,
  allocated_amount integer not null check (allocated_amount > 0),
  shipped_amount integer not null default 0 check (shipped_amount >= 0),
  confirmed_at timestamptz not null default now()
);

alter table inventory_items
  add column if not exists allocated_stock integer not null default 0;

alter table inventory_allocations
  add column if not exists shipped_amount integer not null default 0;

alter table if exists shipments
  alter column lot_no type text;

update inventory_items
   set allocated_stock = 0
 where allocated_stock is null;

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

create or replace function ship_inventory_for_post(
  p_post_id uuid,
  p_quantity integer
) returns void as $$
declare
  v_post record;
  v_remaining integer := p_quantity;
  v_consume integer := 0;
  v_allocation record;
  v_inventory record;
begin
  if p_quantity <= 0 then
    raise exception '出荷数は1以上で入力してください';
  end if;

  select *
    into v_post
    from posts
   where id = p_post_id
   for update;

  if not found then
    raise exception '受注データが見つかりません';
  end if;

  for v_allocation in
    select *
      from inventory_allocations
     where post_id = p_post_id
       and allocated_amount - shipped_amount > 0
     order by confirmed_at asc, lot_no asc
     for update
  loop
    exit when v_remaining <= 0;

    v_consume := least(
      v_remaining,
      v_allocation.allocated_amount - v_allocation.shipped_amount
    );

    select *
      into v_inventory
      from inventory_items
     where id = v_allocation.inventory_item_id
     for update;

    if not found then
      raise exception '引当済み在庫レコードが見つかりません';
    end if;

    if v_inventory.current_stock < v_consume
       or coalesce(v_inventory.allocated_stock, 0) < v_consume then
      raise exception '引当済み在庫数が不足しています';
    end if;

    update inventory_items
       set current_stock = current_stock - v_consume,
           allocated_stock = coalesce(allocated_stock, 0) - v_consume,
           updated_at = now()
     where id = v_inventory.id;

    update inventory_allocations
       set shipped_amount = shipped_amount + v_consume
     where id = v_allocation.id;

    delete from inventory_items
     where id = v_inventory.id
       and current_stock <= 0
       and coalesce(allocated_stock, 0) <= 0;

    v_remaining := v_remaining - v_consume;
  end loop;

  for v_inventory in
    select *
      from inventory_items
     where product_code = v_post.product_code
       and greatest(current_stock - coalesce(allocated_stock, 0), 0) > 0
     order by updated_at asc, lot_no asc
     for update
  loop
    exit when v_remaining <= 0;

    v_consume := least(
      v_remaining,
      greatest(
        v_inventory.current_stock - coalesce(v_inventory.allocated_stock, 0),
        0
      )
    );

    update inventory_items
       set current_stock = current_stock - v_consume,
           updated_at = now()
     where id = v_inventory.id;

    delete from inventory_items
     where id = v_inventory.id
       and current_stock <= 0
       and coalesce(allocated_stock, 0) <= 0;

    v_remaining := v_remaining - v_consume;
  end loop;

  if v_remaining > 0 then
    raise exception '出荷可能な在庫数が不足しています';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function ship_inventory_for_post(uuid, integer) to anon, authenticated;
