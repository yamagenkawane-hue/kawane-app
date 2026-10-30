begin;
revoke create on schema public from public,anon,authenticated;
do $$
declare f record;
begin
  for f in select p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
  loop
    execute format('alter function public.%I(%s) set search_path=public,pg_temp',f.proname,f.args);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
