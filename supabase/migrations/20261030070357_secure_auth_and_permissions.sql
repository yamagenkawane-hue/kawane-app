begin;
create schema if not exists app_private;
revoke all on schema app_private from public,anon;
grant usage on schema app_private to authenticated,service_role;

create table public.app_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  login_id text not null unique check(length(login_id) between 1 and 128 and login_id=btrim(login_id)),
  auth_email text not null unique,
  manager boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.app_profiles enable row level security;
insert into public.app_profiles(id,login_id,auth_email,manager,active)
  select u.id,u.name,a.email,coalesce(u.manager,false),not coalesce(u."delete",false)
  from public."user" u join auth.users a on a.id=u.id;
do $$ begin
  if exists(select 1 from public."user" u where not coalesce(u."delete",false)
    and not exists(select 1 from public.app_profiles p where p.id=u.id)) then
    raise exception 'Authへのアカウント準備が未完了です';
  end if;
  if not exists(select 1 from public.app_profiles where manager and active) then raise exception '有効な管理者が必要です'; end if;
end $$;
revoke all on public.app_profiles from public,anon,authenticated;
grant select(id,login_id,manager,active) on public.app_profiles to authenticated;
grant all on public.app_profiles to service_role;

create function app_private.is_member(p_manager boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_profiles p where p.id=(select auth.uid()) and p.active
    and (not p_manager or p.manager)
    and exists(select 1 from auth.sessions s where s.user_id=p.id and s.id::text=auth.jwt()->>'session_id'));
$$;
revoke all on function app_private.is_member(boolean) from public,anon;
grant execute on function app_private.is_member(boolean) to authenticated,service_role;
create policy profile_self_read on public.app_profiles for select to authenticated
  using(id=(select auth.uid()) and (select app_private.is_member(false)));

create function app_private.assert_access(p_manager boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
  if not app_private.is_member(p_manager) then raise exception 'この操作を行う権限がありません' using errcode='42501'; end if;
end $$;
revoke all on function app_private.assert_access(boolean) from public,anon;
grant execute on function app_private.assert_access(boolean) to authenticated,service_role;

-- Serialize changes so concurrent demotion/deactivation cannot remove all managers.
create function app_private.protect_last_manager() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(87700301);
  if old.manager and old.active and (tg_op='DELETE' or not new.manager or not new.active) then
    if not exists(select 1 from public.app_profiles where id<>old.id and manager and active) then
      raise exception '最後の有効な管理者は無効化・降格・削除できません';
    end if;
  end if;
  if tg_op='UPDATE' and old.active and not new.active then
    delete from auth.sessions where user_id=old.id;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function app_private.protect_last_manager() from public,anon,authenticated;
create trigger protect_last_manager before update or delete on public.app_profiles
  for each row execute function app_private.protect_last_manager();

create table app_private.login_attempts(key text primary key,window_start timestamptz not null,attempts integer not null);
revoke all on app_private.login_attempts from public,anon,authenticated;
create function public.consume_login_attempt(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_attempts integer;
begin
  insert into app_private.login_attempts values(p_key,now(),1)
  on conflict(key) do update set
    attempts=case when app_private.login_attempts.window_start<now()-interval '15 minutes' then 1 else app_private.login_attempts.attempts+1 end,
    window_start=case when app_private.login_attempts.window_start<now()-interval '15 minutes' then now() else app_private.login_attempts.window_start end
  returning attempts into v_attempts;
  delete from app_private.login_attempts where window_start<now()-interval '1 day';
  return v_attempts<=15;
end $$;
revoke all on function public.consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;

-- Every public data path requires a signed, active application account.
do $$
declare t record; pol record; is_master boolean;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname<>'app_profiles'
  loop
    execute format('revoke all on public.%I from public,anon,authenticated',t.relname);
    execute format('alter table public.%I enable row level security',t.relname);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t.relname loop
      execute format('drop policy %I on public.%I',pol.policyname,t.relname);
    end loop;
    -- The legacy credential table is never exposed, even to authenticated users.
    if t.relname in ('user','legacy_post_process_logs_archive') then continue; end if;
    execute format('grant select on public.%I to authenticated',t.relname);
    execute format('create policy app_read on public.%I for select to authenticated using ((select app_private.is_member(false)))',t.relname);
    if t.relname in ('process_transfer_history','lot_process_balance','outsource_remainder_schedules',
      'ai_prediction_runs','ai_prediction_input_snapshots','ai_prediction_results','ai_prediction_latest','ai_prediction_evaluations') then continue; end if;
    is_master:=t.relname in ('customer_master','product_master','product_processes','material_master','process_master','line_master','subcontractors','company_calendar','ai_prediction_settings','ai_prediction_reference_starts','inventory_items');
    execute format('grant insert,update,delete on public.%I to authenticated',t.relname);
    execute format('create policy app_insert on public.%I for insert to authenticated with check ((select app_private.is_member(%L)))',t.relname,is_master or t.relname='posts');
    execute format('create policy app_update on public.%I for update to authenticated using ((select app_private.is_member(%L))) with check ((select app_private.is_member(%L)))',t.relname,is_master,is_master);
    execute format('create policy app_delete on public.%I for delete to authenticated using ((select app_private.is_member(true)))',t.relname);
  end loop;
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' loop
    execute format('revoke all on public.%I from public,anon,authenticated',t.relname);
    execute format('alter view public.%I set (security_invoker=true)',t.relname);
    execute format('grant select on public.%I to authenticated',t.relname);
  end loop;
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S' loop
    execute format('revoke all on sequence public.%I from public,anon',t.relname);
    execute format('grant usage,select on sequence public.%I to authenticated',t.relname);
  end loop;
end $$;

-- SECURITY DEFINER workflow RPCs must authorize before bypassing table RLS.
-- Fail the migration if a callable body is unfamiliar, rather than leave a bypass.
do $$
declare f record; body text; definition text; manager_only boolean;
begin
  for f in select p.oid,p.proname,p.prosrc,l.lanname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.prokind='f'
  loop
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.args);
    if f.proname='consume_login_attempt' or f.proname like '%_base' or f.proname like '%_legacy' then continue; end if;
    if (select prorettype='trigger'::regtype from pg_proc where oid=f.oid) then continue; end if;
    if f.lanname='plpgsql' then
      if f.prosrc !~* '\mbegin\M' then raise exception 'Unsupported RPC body: %',f.proname; end if;
      manager_only:=f.proname in ('permanently_delete_lot','soft_delete_lot','restore_deleted_lot','soft_delete_order_post',
        'delete_weighing_result','reorder_order_processes','normalize_order_process_sequence_for_post','sync_order_processes_from_product_master',
        'cancel_shipment_and_restore_inventory','deduct_inventory');
      body:=regexp_replace(f.prosrc,'\mbegin\M',format('begin perform app_private.assert_access(%L);',manager_only),'i');
      definition:=pg_get_functiondef(f.oid);
      definition:=replace(definition,f.prosrc,body);
      execute definition;
    elsif f.lanname='sql' then
      if f.proname not in ('register_order_process_result','transfer_lot_to_next_process','order_has_process_progress') then
        raise exception 'Unsupported SQL RPC: %',f.proname;
      end if;
      -- SQL overloads delegate to the guarded full-argument PL/pgSQL RPCs.
      -- The progress helper must only accept active application sessions too.
      if f.proname='order_has_process_progress' then
        definition:=pg_get_functiondef(f.oid);
        body:=format('begin perform app_private.assert_access(false); return (%s); end',regexp_replace(btrim(f.prosrc),';\s*$',''));
        definition:=replace(definition,f.prosrc,body);
        definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
        execute definition;
      end if;
    else raise exception 'Unsupported RPC language: %',f.proname;
    end if;
    execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,f.args);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public,anon;
create function public.revoke_app_user_sessions(p_id uuid) returns void language sql security definer set search_path='' as $$
  delete from auth.sessions where user_id=p_id;
$$;
revoke all on function public.revoke_app_user_sessions(uuid) from public,anon,authenticated;
grant execute on function public.revoke_app_user_sessions(uuid) to service_role;
notify pgrst,'reload schema';
commit;
