begin;
create table if not exists public.outsource_remainder_schedules (
  id uuid primary key,
  order_process_id uuid not null references public.order_processes(id) on delete restrict,
  dispatch_no integer not null check(dispatch_no>0),
  quantity integer not null check(quantity>0),
  moved_amount integer not null default 0 check(moved_amount>=0 and moved_amount<=quantity),
  sent_date date, expected_date date, returned_date date,
  note text not null default '', cancelled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(order_process_id,dispatch_no)
);
create index if not exists outsource_remainder_schedules_process_idx on public.outsource_remainder_schedules(order_process_id);
alter table public.outsource_remainder_schedules enable row level security;
drop policy if exists read_outsource_remainder_schedules on public.outsource_remainder_schedules;
create policy read_outsource_remainder_schedules on public.outsource_remainder_schedules for select to anon,authenticated using(true);
revoke all on public.outsource_remainder_schedules from public,anon,authenticated;
grant select on public.outsource_remainder_schedules to anon,authenticated,service_role;
alter table public.process_transfer_history add column if not exists outsource_remainder_schedule_id uuid
  references public.outsource_remainder_schedules(id) on delete restrict;

create or replace function public.save_outsource_remainder_schedule(
  p_id uuid,p_order_process_id uuid,p_quantity integer,p_sent_date date,p_expected_date date,
  p_returned_date date,p_note text,p_updated_at timestamptz,p_cancelled boolean
) returns public.outsource_remainder_schedules
language plpgsql security definer set search_path=public as $$
declare
  v_source order_processes%rowtype;
  v_record outsource_remainder_schedules%rowtype;
  v_post uuid; v_other_reserved integer; v_dispatch_no integer;
begin
  select post_id into v_post from order_processes where id=p_order_process_id;
  perform 1 from posts where id=v_post and "delete" is not true for update;
  if not found then raise exception '有効な注番が見つかりません'; end if;
  select * into v_source from order_processes where id=p_order_process_id for update;
  if v_source.locked then raise exception 'ロックされた工程の日程は変更できません'; end if;
  if not (v_source.subcontractor_id is not null or v_source.process_name ~ '外注|メッキ'
    or exists(select 1 from product_processes pp join process_master pm on pm.id=pp.process_master_id
      where pp.id=v_source.product_process_id and pm.outsourcing is true)) then raise exception '外注加工の工程ではありません'; end if;
  select * into v_record from outsource_remainder_schedules where id=p_id for update;
  if found then
    if v_record.order_process_id<>p_order_process_id or v_record.cancelled then raise exception '追加日程の対象が一致しません'; end if;
    if v_record.updated_at is distinct from p_updated_at then raise exception '追加日程が更新されています。再読み込みしてください'; end if;
    if v_record.moved_amount>0 and (p_cancelled or v_record.sent_date is distinct from p_sent_date
      or v_record.expected_date is distinct from p_expected_date or v_record.returned_date is distinct from p_returned_date) then
      raise exception '工程移動済みの日程は変更・取消できません';
    end if;
  elsif p_updated_at is not null or p_cancelled then raise exception '追加日程が見つかりません';
  end if;
  if not p_cancelled then
    if p_quantity is null or p_quantity<=0 or p_quantity<coalesce(v_record.moved_amount,0) then raise exception '対象数量を確認してください'; end if;
    if p_sent_date>(now() at time zone 'Asia/Tokyo')::date or p_returned_date>(now() at time zone 'Asia/Tokyo')::date then raise exception '出し日・実績日は本日以前の日付を入力してください'; end if;
    if (p_returned_date is not null and p_sent_date is null) or p_expected_date<p_sent_date or p_returned_date<p_sent_date then raise exception '出し日・予定日・実績日の前後関係を確認してください'; end if;
    select coalesce(sum(quantity-moved_amount),0)::integer into v_other_reserved from outsource_remainder_schedules
      where order_process_id=p_order_process_id and not cancelled and id<>p_id;
    if p_quantity-coalesce(v_record.moved_amount,0)>greatest(v_source.planned_amount-v_source.completed_amount-v_other_reserved,0) then
      raise exception '未登録の残数量を超えています。他の追加日程の数量も確認してください';
    end if;
  end if;
  select coalesce(v_record.dispatch_no,coalesce(max(dispatch_no),0)+1) into v_dispatch_no
    from outsource_remainder_schedules where order_process_id=p_order_process_id;
  insert into outsource_remainder_schedules(id,order_process_id,dispatch_no,quantity,sent_date,expected_date,returned_date,note,cancelled)
    values(p_id,p_order_process_id,v_dispatch_no,p_quantity,p_sent_date,p_expected_date,p_returned_date,coalesce(p_note,''),p_cancelled)
    on conflict(id) do update set quantity=excluded.quantity,sent_date=excluded.sent_date,expected_date=excluded.expected_date,
      returned_date=excluded.returned_date,note=excluded.note,cancelled=excluded.cancelled,updated_at=clock_timestamp()
    returning * into v_record;
  -- Preserve initial dates; mirror the current dispatch status for existing screens/guards.
  update order_processes set outsource_status=case
      when exists(select 1 from outsource_remainder_schedules where order_process_id=p_order_process_id and not cancelled and sent_date is not null and returned_date is null) then 'sent'
      when v_source.outsource_returned_date is not null or exists(select 1 from outsource_remainder_schedules where order_process_id=p_order_process_id and not cancelled and returned_date is not null) then 'returned'
      when v_source.outsource_sent_date is not null then 'sent' else 'not_sent' end,
    updated_at=now() where id=p_order_process_id;
  return v_record;
end $$;
revoke all on function public.save_outsource_remainder_schedule(uuid,uuid,integer,date,date,date,text,timestamptz,boolean) from public;
grant execute on function public.save_outsource_remainder_schedule(uuid,uuid,integer,date,date,date,text,timestamptz,boolean) to anon,authenticated,service_role;

create or replace function public.transfer_outsource_remainder_lot(
  p_schedule_id uuid,p_lot_id uuid,p_from_order_process_id uuid,p_amount integer,
  p_sent_date date,p_expected_date date,p_returned_date date,p_idempotency_key text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_schedule outsource_remainder_schedules%rowtype;
  v_history process_transfer_history%rowtype;
  v_post uuid; v_before integer; v_balance uuid; v_id uuid:=coalesce(p_schedule_id,gen_random_uuid());
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception '処理キーが必要です'; end if;
  if p_sent_date is null or p_expected_date is null or p_returned_date is null then raise exception '出し日・予定日・実績日をすべて入力してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  select * into v_history from process_transfer_history where idempotency_key=p_idempotency_key;
  if found then
    if v_history.lot_id is distinct from p_lot_id or v_history.from_order_process_id is distinct from p_from_order_process_id
      or v_history.quantity is distinct from p_amount or v_history.outsource_remainder_schedule_id is null
      or (p_schedule_id is not null and v_history.outsource_remainder_schedule_id<>p_schedule_id)
      or not exists(select 1 from production_results where id=v_history.source_result_id and date=p_returned_date) then
      raise exception '同じ処理キーで異なる工程移動は登録できません';
    end if;
    return;
  end if;
  select post_id into v_post from order_processes where id=p_from_order_process_id;
  perform 1 from posts where id=v_post and "delete" is not true for update;
  if not found then raise exception '有効な注番が見つかりません'; end if;
  perform 1 from order_processes where id=p_from_order_process_id for update;
  select * into v_schedule from outsource_remainder_schedules where id=v_id for update;
  if p_schedule_id is not null and not found then raise exception '追加日程が見つかりません'; end if;
  if p_amount is null or p_amount<=0 or (v_schedule.id is not null and p_amount>v_schedule.quantity-v_schedule.moved_amount) then raise exception '追加日程の未移動数量を超えています'; end if;
  v_schedule:=save_outsource_remainder_schedule(v_id,p_from_order_process_id,
    coalesce(v_schedule.quantity,p_amount),p_sent_date,p_expected_date,p_returned_date,
    coalesce(v_schedule.note,''),v_schedule.updated_at,false);
  if v_schedule.order_process_id<>p_from_order_process_id then raise exception '追加日程と工程が一致しません'; end if;
  select id,quantity into v_balance,v_before from lot_process_balance where lot_id=p_lot_id and order_process_id=p_from_order_process_id for update;
  perform * from transfer_lot_to_next_process(p_lot_id,p_from_order_process_id,p_amount,
    '残数分の外注日程で次工程へ移動',p_idempotency_key,p_returned_date);
  -- A dispatch can cover part of a lot. Leave the untransferred quantity in this process.
  if v_before>p_amount then
    update lot_process_balance set quantity=v_before-p_amount,updated_at=now() where id=v_balance;
    update process_transfer_history set after_from_quantity=v_before-p_amount,correction_quantity=0,movement_type='process_transfer'
      where idempotency_key=p_idempotency_key;
  end if;
  update process_transfer_history set outsource_remainder_schedule_id=v_id where idempotency_key=p_idempotency_key;
  update outsource_remainder_schedules set moved_amount=moved_amount+p_amount,updated_at=clock_timestamp() where id=v_id;
end $$;
revoke all on function public.transfer_outsource_remainder_lot(uuid,uuid,uuid,integer,date,date,date,text) from public;
grant execute on function public.transfer_outsource_remainder_lot(uuid,uuid,uuid,integer,date,date,date,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
