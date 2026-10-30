begin;

-- RLS authorizes rows, not individual columns. Keep daily edits while forcing
-- cancellation/restoration through the already-authorized SECURITY DEFINER RPCs.
-- Do not modify an applied migration: this repairs the broad grants introduced
-- by 20261030070357_secure_auth_and_permissions.sql.
do $$
declare
  target record;
  editable_columns text;
  column_name text;
begin
  for target in select * from (values
    ('posts', 'delete', array['delete']),
    ('lots', 'deleted', array['deleted','deleted_at','deleted_reason']))
    as targets(table_name, protected_column, protected_columns)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=target.table_name
        and information_schema.columns.column_name=target.protected_column
    ) then
      raise exception 'Missing workflow column %.%',target.table_name,target.protected_column;
    end if;

    execute format('revoke update on public.%I from public,anon,authenticated',target.table_name);
    -- Table-level REVOKE does not remove any pre-existing column-level grant.
    for column_name in select a.attname from pg_attribute a
      where a.attrelid=format('public.%I',target.table_name)::regclass
        and a.attnum>0 and not a.attisdropped
    loop
      execute format('revoke update (%I) on public.%I from public,anon,authenticated',column_name,target.table_name);
    end loop;
    select string_agg(format('%I',a.attname),',' order by a.attnum)
      into editable_columns from pg_attribute a
      where a.attrelid=format('public.%I',target.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attname<>all(target.protected_columns);
    execute format('grant update (%s) on public.%I to authenticated',editable_columns,target.table_name);
    -- Restrictive policies compose with all existing/future permissive policies.
    -- Explicit false is supported by the current order-creation client.
    execute format('drop policy if exists workflow_active_insert on public.%I',target.table_name);
    execute format('create policy workflow_active_insert on public.%I as restrictive for insert to authenticated with check (%I is not true)',target.table_name,target.protected_column);
  end loop;
end $$;

drop policy if exists workflow_clean_deletion_metadata on public.lots;
create policy workflow_clean_deletion_metadata on public.lots as restrictive
  for insert to authenticated with check (deleted_at is null and deleted_reason is null);

-- Reinstates the original cancellation migration's no-direct-delete contract.
-- The administrator RPC retains the checks for associated history.
revoke delete on public.posts from public,anon,authenticated;
drop policy if exists app_delete on public.posts;

-- Shipments and their inventory/allocation movements are one transaction.
-- Even administrators must use register_shipment / cancel_shipment_and_restore_inventory.
revoke insert,update,delete on public.shipments from public,anon,authenticated;
do $$
declare column_name text;
begin
  for column_name in select attname from pg_attribute
    where attrelid='public.shipments'::regclass and attnum>0 and not attisdropped
  loop
    execute format('revoke insert (%I),update (%I) on public.shipments from public,anon,authenticated',column_name,column_name);
  end loop;
end $$;
drop policy if exists app_insert on public.shipments;
drop policy if exists app_update on public.shipments;
drop policy if exists app_delete on public.shipments;

-- The auth migration's RPC loop also re-exposed this retired inventory-only
-- shipment path. It has no shipment journal or idempotency contract and must
-- never compete with register_shipment. Older fixtures may not contain it.
do $$
begin
  if to_regprocedure('public.ship_inventory_for_post(uuid,integer)') is not null then
    revoke all on function public.ship_inventory_for_post(uuid,integer) from public,anon,authenticated;
  end if;
end $$;

-- No legacy credentials are deleted by this migration. Their separately
-- approved disposal and backup-retention gates are documented in the auth spec.
notify pgrst,'reload schema';
commit;
