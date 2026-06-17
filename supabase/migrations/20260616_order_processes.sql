create table if not exists order_processes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  order_no text not null,
  product_code text not null,
  product_name text not null,
  customer_name text not null,
  process_name text not null,
  process_order integer not null,
  planned_amount integer not null default 0,
  completed_amount integer not null default 0,
  completed_date date,
  subcontractor_id uuid references subcontractors(id) on delete set null,
  locked boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists order_processes_post_order_idx
  on order_processes (post_id, process_order);

create unique index if not exists order_processes_post_process_order_idx
  on order_processes (post_id, process_order);

alter table production_results
  add column if not exists order_process_id uuid references order_processes(id) on delete set null;

create or replace function create_order_processes_for_post(p_post_id uuid)
returns void as $$
begin
  insert into order_processes (
    post_id,
    order_no,
    product_code,
    product_name,
    customer_name,
    process_name,
    process_order,
    planned_amount,
    subcontractor_id
  )
  select
    p.id,
    p.order_no,
    p.product_code,
    p.product_name,
    p.customer_name,
    pp.process_name,
    pp.process_order,
    p.order_amount,
    pp.subcontractor_id
  from posts p
  join product_processes pp
    on pp.product_code = p.product_code
  where p.id = p_post_id
    and not exists (
      select 1
      from order_processes op
      where op.post_id = p.id
        and op.process_order = pp.process_order
    )
  order by pp.process_order;
end;
$$ language plpgsql;

create or replace function register_order_process_result(
  p_order_process_id uuid,
  p_schedule_id uuid,
  p_date date,
  p_amount integer
) returns void as $$
declare
  target_process order_processes%rowtype;
  previous_completed integer;
  new_completed integer;
begin
  if p_amount <= 0 then
    raise exception '数量は1以上で入力してください';
  end if;

  select *
  into target_process
  from order_processes
  where id = p_order_process_id
  for update;

  if not found then
    raise exception '工程予定が見つかりません';
  end if;

  if target_process.locked then
    raise exception '確定済みの工程は変更できません';
  end if;

  if target_process.process_order = 1 then
    previous_completed := target_process.planned_amount;
  else
    select coalesce(completed_amount, 0)
    into previous_completed
    from order_processes
    where post_id = target_process.post_id
      and process_order < target_process.process_order
    order by process_order desc
    limit 1;

    previous_completed := coalesce(previous_completed, 0);
  end if;

  new_completed := target_process.completed_amount + p_amount;

  if new_completed > previous_completed then
    raise exception '前工程の完了数量を超えて登録することはできません';
  end if;

  insert into production_results (
    schedule_id,
    post_id,
    order_process_id,
    process_id,
    process_name,
    date,
    amount,
    created_at
  ) values (
    p_schedule_id,
    target_process.post_id,
    target_process.id,
    target_process.id::text,
    target_process.process_name,
    p_date,
    p_amount,
    now()
  );

  update order_processes
  set completed_amount = new_completed,
      completed_date = p_date,
      updated_at = now()
  where id = target_process.id;
end;
$$ language plpgsql;

grant execute on function create_order_processes_for_post(uuid) to anon, authenticated;
grant execute on function register_order_process_result(uuid, uuid, date, integer) to anon, authenticated;
