begin;
-- Finish measurement and packaging together from the progress screen.
-- Existing packaging-waiting lots can also be completed through this entry point.
create or replace function public.complete_lot_from_progress(
  p_lot_id uuid,p_from_order_process_id uuid,p_amount integer,p_reason text,p_idempotency_key text,p_date date
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_source order_processes%rowtype;
  v_next order_processes%rowtype;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception '処理キーが必要です'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  if exists(select 1 from process_transfer_history where idempotency_key=p_idempotency_key||':finish') then return; end if;
  select * into v_source from order_processes where id=p_from_order_process_id for update;
  if not found then raise exception '工程が見つかりません'; end if;
  select * into v_next from order_processes where post_id=v_source.post_id and process_order>v_source.process_order
    order by process_order limit 1;
  if v_source.process_name like '%計量%' and v_next.id is not null
    and (v_next.process_name like '%梱包%' or v_next.process_name like '%包装%')
    and not exists(select 1 from order_processes where post_id=v_source.post_id and process_order>v_next.process_order) then
    if exists(select 1 from lot_process_balance where lot_id=p_lot_id and order_process_id=v_next.id and quantity>0) then
      raise exception '同じロットの梱包待ち数量を先に完了してください';
    end if;
    perform * from transfer_lot_to_next_process(p_lot_id,p_from_order_process_id,p_amount,p_reason,p_idempotency_key||':measurement',p_date);
    perform * from transfer_lot_to_next_process(p_lot_id,v_next.id,p_amount,p_reason,p_idempotency_key||':finish',p_date);
  elsif v_next.id is null and (v_source.process_name like '%梱包%' or v_source.process_name like '%包装%' or v_source.process_name like '%計量%') then
    perform * from transfer_lot_to_next_process(p_lot_id,p_from_order_process_id,p_amount,p_reason,p_idempotency_key||':finish',p_date);
  else
    raise exception '計量・梱包の工程構成を確認してください。後続工程があるため完了できません';
  end if;
end $$;
revoke all on function public.complete_lot_from_progress(uuid,uuid,integer,text,text,date) from public;
grant execute on function public.complete_lot_from_progress(uuid,uuid,integer,text,text,date) to anon,authenticated;
notify pgrst,'reload schema';
commit;
