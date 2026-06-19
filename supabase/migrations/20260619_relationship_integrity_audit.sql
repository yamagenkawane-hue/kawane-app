-- Phase 3: repair and audit id-based relationships.
-- Run this after 20260619_relationships_phase1.sql and 20260619_relationship_views_phase2.sql.
--
-- After running, check:
--   select * from v_relationship_integrity_summary order by issue_count desc, check_name;
--   select * from v_relationship_integrity_issues order by table_name, check_name, key_value;

update product_master pm
set customer_id = cm.id
from customer_master cm
where pm.customer_id is null
  and nullif(trim(pm.customer_name), '') is not null
  and pm.customer_name = cm.customer_name;

update posts p
set product_id = pm.id
from product_master pm
where p.product_id is null
  and nullif(trim(p.product_code), '') is not null
  and p.product_code = pm.product_code;

update posts p
set product_id = pm.id
from product_master pm
where p.product_id is null
  and nullif(trim(p.product_name), '') is not null
  and p.product_name = pm.product_name
  and (
    p.customer_id = pm.customer_id
    or p.customer_name = pm.customer_name
  );

update posts p
set customer_id = cm.id
from customer_master cm
where p.customer_id is null
  and nullif(trim(p.customer_name), '') is not null
  and p.customer_name = cm.customer_name;

update product_processes pp
set product_id = pm.id
from product_master pm
where pp.product_id is null
  and nullif(trim(pp.product_code), '') is not null
  and pp.product_code = pm.product_code;

update product_processes pp
set process_master_id = pr.id
from process_master pr
where pp.process_master_id is null
  and nullif(trim(pp.process_name), '') is not null
  and (
    pp.process_name = pr.name
    or pp.process_name = pr.process_id
  );

update order_processes op
set product_id = coalesce(op.product_id, p.product_id, pm.id),
    customer_id = coalesce(op.customer_id, p.customer_id, cm.id)
from posts p
left join product_master pm
  on pm.product_code = op.product_code
  or pm.product_name = op.product_name
left join customer_master cm
  on cm.customer_name = op.customer_name
where op.post_id = p.id
  and (op.product_id is null or op.customer_id is null);

update order_processes op
set product_process_id = pp.id
from product_processes pp
where op.product_process_id is null
  and op.process_order = pp.process_order
  and (
    op.product_id = pp.product_id
    or op.product_code = pp.product_code
  )
  and (
    op.process_name = pp.process_name
    or op.process_name = (
      select pr.name
      from process_master pr
      where pr.id = pp.process_master_id
      limit 1
    )
  );

update production_schedules ps
set post_id = p.id
from posts p
where ps.post_id is null
  and nullif(trim(ps.order_no), '') is not null
  and ps.order_no = p.order_no;

update production_schedules ps
set product_id = coalesce(
      ps.product_id,
      (select p.product_id from posts p where p.id = ps.post_id limit 1),
      (
        select pm.id
        from product_master pm
        where pm.product_name = ps.product_name
          and (pm.customer_id = ps.customer_id or pm.customer_name = ps.customer_name)
        limit 1
      ),
      (
        select pm.id
        from product_master pm
        where pm.product_code = ps.press_number
        limit 1
      )
    ),
    customer_id = coalesce(
      ps.customer_id,
      (select p.customer_id from posts p where p.id = ps.post_id limit 1),
      (
        select cm.id
        from customer_master cm
        where cm.customer_name = ps.customer_name
        limit 1
      )
    )
where ps.product_id is null
   or ps.customer_id is null;

update production_results prr
set post_id = coalesce(
      prr.post_id,
      (select op.post_id from order_processes op where op.id = prr.order_process_id limit 1),
      (select ps.post_id from production_schedules ps where ps.id = prr.schedule_id limit 1)
    )
where prr.post_id is null;

update inventory_items ii
set product_id = coalesce(
      ii.product_id,
      (
        select pm.id
        from product_master pm
        where pm.product_code = ii.product_code
        limit 1
      ),
      (
        select pm.id
        from product_master pm
        where pm.product_name = ii.product_name
        limit 1
      )
    )
where ii.product_id is null;

update lots l
set product_id = coalesce(
      l.product_id,
      (
        select pm.id
        from product_master pm
        where pm.product_name = l.product_name
          and (pm.customer_id = l.customer_id or pm.customer_name = l.customer_name)
        limit 1
      )
    ),
    customer_id = coalesce(
      l.customer_id,
      (
        select cm.id
        from customer_master cm
        where cm.customer_name = l.customer_name
        limit 1
      )
    )
where l.product_id is null
   or l.customer_id is null;

update shipments s
set product_id = coalesce(
      s.product_id,
      (select p.product_id from posts p where p.id = s.post_id limit 1),
      (
        select pm.id
        from product_master pm
        where pm.product_name = s.product_name
        limit 1
      )
    ),
    customer_id = coalesce(
      s.customer_id,
      (select p.customer_id from posts p where p.id = s.post_id limit 1),
      (
        select cm.id
        from customer_master cm
        where cm.customer_name = s.customer_name
        limit 1
      )
    )
where s.product_id is null
   or s.customer_id is null;

update inventory_allocations ia
set product_id = coalesce(
      ia.product_id,
      (select p.product_id from posts p where p.id = ia.post_id limit 1),
      (select ii.product_id from inventory_items ii where ii.id = ia.inventory_item_id limit 1),
      (
        select pm.id
        from product_master pm
        where pm.product_code = ia.product_code
        limit 1
      )
    )
where ia.product_id is null;

create or replace view v_relationship_integrity_issues as
select
  'duplicate_customer_name'::text as check_name,
  'customer_master'::text as table_name,
  null::text as record_id,
  customer_name::text as key_value,
  ('customer_name is duplicated: ' || count(*))::text as issue_detail
from customer_master
where nullif(trim(customer_name), '') is not null
group by customer_name
having count(*) > 1

union all
select
  'duplicate_product_code',
  'product_master',
  null,
  product_code::text,
  ('product_code is duplicated: ' || count(*))::text
from product_master
where nullif(trim(product_code), '') is not null
group by product_code
having count(*) > 1

union all
select
  'missing_customer_id',
  'product_master',
  pm.id::text,
  pm.product_code::text,
  ('customer_name=' || coalesce(pm.customer_name, ''))::text
from product_master pm
left join customer_master cm on cm.id = pm.customer_id
where nullif(trim(pm.customer_name), '') is not null
  and (pm.customer_id is null or cm.id is null)

union all
select
  'missing_product_id',
  'posts',
  p.id::text,
  p.order_no::text,
  ('product_code=' || coalesce(p.product_code, '') || ', product_name=' || coalesce(p.product_name, ''))::text
from posts p
left join product_master pm on pm.id = p.product_id
where (nullif(trim(p.product_code), '') is not null or nullif(trim(p.product_name), '') is not null)
  and (p.product_id is null or pm.id is null)

union all
select
  'missing_customer_id',
  'posts',
  p.id::text,
  p.order_no::text,
  ('customer_name=' || coalesce(p.customer_name, ''))::text
from posts p
left join customer_master cm on cm.id = p.customer_id
where nullif(trim(p.customer_name), '') is not null
  and (p.customer_id is null or cm.id is null)

union all
select
  'missing_product_id',
  'product_processes',
  pp.id::text,
  pp.product_code::text,
  ('process_name=' || coalesce(pp.process_name, ''))::text
from product_processes pp
left join product_master pm on pm.id = pp.product_id
where (pp.product_id is null or pm.id is null)

union all
select
  'missing_process_master_id',
  'product_processes',
  pp.id::text,
  pp.product_code::text,
  ('process_name=' || coalesce(pp.process_name, '') || ', process_order=' || coalesce(pp.process_order::text, ''))::text
from product_processes pp
left join process_master pr on pr.id = pp.process_master_id
where pp.process_master_id is null or pr.id is null

union all
select
  'missing_product_or_customer_id',
  'order_processes',
  op.id::text,
  op.order_no::text,
  ('product=' || coalesce(op.product_code, op.product_name, '') || ', customer=' || coalesce(op.customer_name, ''))::text
from order_processes op
left join product_master pm on pm.id = op.product_id
left join customer_master cm on cm.id = op.customer_id
where op.product_id is null
   or pm.id is null
   or op.customer_id is null
   or cm.id is null

union all
select
  'missing_product_process_id',
  'order_processes',
  op.id::text,
  op.order_no::text,
  ('process_name=' || coalesce(op.process_name, '') || ', process_order=' || coalesce(op.process_order::text, ''))::text
from order_processes op
left join product_processes pp on pp.id = op.product_process_id
where op.product_process_id is null or pp.id is null

union all
select
  'missing_post_id',
  'production_schedules',
  ps.id::text,
  ps.order_no::text,
  ('product_name=' || coalesce(ps.product_name, ''))::text
from production_schedules ps
left join posts p on p.id = ps.post_id
where nullif(trim(ps.order_no), '') is not null
  and (ps.post_id is null or p.id is null)

union all
select
  'missing_product_or_customer_id',
  'production_schedules',
  ps.id::text,
  ps.order_no::text,
  ('product_name=' || coalesce(ps.product_name, '') || ', customer_name=' || coalesce(ps.customer_name, ''))::text
from production_schedules ps
left join product_master pm on pm.id = ps.product_id
left join customer_master cm on cm.id = ps.customer_id
where ps.product_id is null
   or pm.id is null
   or ps.customer_id is null
   or cm.id is null

union all
select
  'missing_post_id',
  'production_results',
  prr.id::text,
  coalesce(prr.order_process_id::text, prr.schedule_id::text, ''),
  ('process_name=' || coalesce(prr.process_name, '') || ', date=' || coalesce(prr.date::text, ''))::text
from production_results prr
left join posts p on p.id = prr.post_id
where prr.post_id is null or p.id is null

union all
select
  'missing_product_id',
  'inventory_items',
  ii.id::text,
  coalesce(ii.product_code, ii.product_name, ''),
  ('lot_no=' || coalesce(ii.lot_no, ''))::text
from inventory_items ii
left join product_master pm on pm.id = ii.product_id
where ii.product_id is null or pm.id is null

union all
select
  'missing_product_or_customer_id',
  'lots',
  l.id::text,
  coalesce(l.product_name, l.customer_name, ''),
  ('lot_no=' || coalesce(l.lot_no, ''))::text
from lots l
left join product_master pm on pm.id = l.product_id
left join customer_master cm on cm.id = l.customer_id
where l.product_id is null
   or pm.id is null
   or l.customer_id is null
   or cm.id is null

union all
select
  'missing_product_or_customer_id',
  'shipments',
  s.id::text,
  coalesce(s.order_no, s.product_name, ''),
  ('lot_no=' || coalesce(s.lot_no, ''))::text
from shipments s
left join product_master pm on pm.id = s.product_id
left join customer_master cm on cm.id = s.customer_id
where s.product_id is null
   or pm.id is null
   or s.customer_id is null
   or cm.id is null

union all
select
  'missing_product_id',
  'inventory_allocations',
  ia.id::text,
  coalesce(ia.product_code, ia.lot_no, ''),
  ('post_id=' || coalesce(ia.post_id::text, '') || ', inventory_item_id=' || coalesce(ia.inventory_item_id::text, ''))::text
from inventory_allocations ia
left join product_master pm on pm.id = ia.product_id
where ia.product_id is null or pm.id is null;

create or replace view v_relationship_integrity_summary as
select
  check_name,
  table_name,
  count(*) as issue_count
from v_relationship_integrity_issues
group by check_name, table_name;
