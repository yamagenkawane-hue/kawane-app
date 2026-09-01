select
  'lots_post_lot_material_unique_index' as check_name,
  case when to_regclass('public.lots_post_lot_material_unique_idx') is not null
    then 'PASSED' else 'FAILED' end as result,
  case when to_regclass('public.lots_post_lot_material_unique_idx') is not null
    then 1 else 0 end as actual_count,
  'lots can distinguish rows by post_id, lot_no, and material_lot_no.' as message
union all
select
  'old_lots_post_lot_no_unique_index_removed',
  case when to_regclass('public.lots_post_lot_no_unique_idx') is null
    then 'PASSED' else 'FAILED' end,
  case when to_regclass('public.lots_post_lot_no_unique_idx') is null
    then 0 else 1 end,
  'old post_id + lot_no unique index should be removed.'
union all
select
  'register_manufacturing_lot_result_rpc',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'register_manufacturing_lot_result'
      and oidvectortypes(p.proargtypes) = 'uuid, uuid, date, integer, text, text, text'
  ) then 'PASSED' else 'FAILED' end,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'register_manufacturing_lot_result'
      and oidvectortypes(p.proargtypes) = 'uuid, uuid, date, integer, text, text, text'
  ),
  'register_manufacturing_lot_result(uuid, uuid, date, integer, text, text, text) exists.';
