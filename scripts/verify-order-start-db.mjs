// Synthetic PostgreSQL: new date columns, views and old archive compatibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let passed = 0;
const check = (a, b) => { assert.deepEqual(a, b); passed++; };
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); passed++; };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const read = (file) => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20261111030635_order_planned_start_date.sql');
const uid = '00000000-0000-0000-0000-000000000099';
async function oldOrder(name) {
  const post = (await one(`insert into posts(order_no,product_name,customer_name,order_amount,lot_no,"delete",created_at,updated_at)
    values($1,'合成製品','合成得意先',100,'KEEP-LOT-'||$1,false,now()-interval '4 years',now()-interval '4 years') returning id`, [name])).id;
  const process = (await one(`insert into order_processes(post_id,process_name,process_order,planned_amount,completed_amount,completed_date,updated_at)
    values($1,'製造',1,100,100,(now()-interval '4 years')::date,now()-interval '4 years') returning id`, [post])).id;
  await db.query(`insert into shipments(post_id,order_no,quantity,cancelled,created_at,updated_at,scheduled_date)
    values($1,$2,100,false,now()-interval '4 years',now()-interval '4 years',(now()-interval '4 years')::date)`, [post, name]);
  await db.query(`insert into production_results(post_id,order_process_id,process_name,date,amount,created_at)
    values($1,$2,'製造',(now()-interval '4 years')::date,100,now()-interval '4 years')`, [post, process]);
  return post;
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$select '${uid}'::uuid$$;
    create function app_private.is_member(boolean default false) returns boolean language sql stable as $$select true$$;
    create function app_private.assert_access(boolean default false) returns void language plpgsql as $$begin return;end$$;`);
  await db.exec(read('scripts/fixtures/lot-identity-schema.sql'));
  await db.exec('drop view public.v_posts_with_master');
  await db.exec(read('scripts/fixtures/planned-start-views-before.sql'));
  for (const name of ['20261102100906_history_retention_management.sql', '20261102102115_history_retention_restore_lock.sql']) {
    await db.exec(read(`supabase/migrations/${name}`));
  }
  const archived = await oldOrder('OLD-ARCHIVE');
  const packet = (await one('select prepare_history_export($1) packet', [archived])).packet;
  check((await one('select execute_history_retention($1,$2,false) result', [packet.export_id, packet.payload])).result.archived, true);
  const columnsBefore = {};
  for (const view of ['v_posts_with_master', 'v_production_schedules_with_master']) {
    columnsBefore[view] = (await db.query('select column_name from information_schema.columns where table_schema=\'public\' and table_name=$1 order by ordinal_position', [view])).rows.map((r) => r.column_name);
  }
  const countBefore = (await one('select count(*)::int n from posts')).n;
  await db.exec(migration);
  await db.exec(migration);
  check((await one('select count(*)::int n from posts')).n, countBefore);
  check((await one('select lot_no,planned_start_date from posts where id=$1', [archived])).lot_no, 'KEEP-LOT-OLD-ARCHIVE');
  check((await one('select lot_no,planned_start_date from posts where id=$1', [archived])).planned_start_date, null);
  for (const view of Object.keys(columnsBefore)) {
    const columns = (await db.query('select column_name from information_schema.columns where table_schema=\'public\' and table_name=$1 order by ordinal_position', [view])).rows.map((r) => r.column_name);
    check(columns.join(','), [...columnsBefore[view], 'planned_start_date'].join(','));
    check((await one('select reloptions from pg_class where oid=$1::regclass', [`public.${view}`])).reloptions.includes('security_invoker=true'), true);
  }
  // Existing archived files retain their exact anchor shape after a NULL-only column is added.
  check((await one('select app_private.history_packet($1) packet', [archived])).packet.anchors, packet.payload.anchors);
  check((await one('select execute_history_retention($1,$2,true) result', [packet.export_id, packet.payload])).result.restored, true);
  check((await one('select count(*)::int n from production_results where post_id=$1', [archived])).n, 1);
  check((await one('select app_private.history_packet($1) packet', [archived])).packet, packet.payload);

  const post = (await one(`insert into posts(order_no,product_name,customer_name,order_amount,planned_start_date,completion_scheduled_date,delivery_date)
    values('NEW','合成製品','合成得意先',100,'2026-12-03','2026-12-08','2026-12-10') returning id`)).id;
  check((await one('select planned_start_date::text date,lot_no from posts where id=$1', [post])).date, '2026-12-03');
  check((await one('select planned_start_date::text date,lot_no from posts where id=$1', [post])).lot_no, null);
  check((await one('select planned_start_date::text date from v_posts_with_master where id=$1', [post])).date, '2026-12-03');
  const linked = (await one(`insert into production_schedules(post_id,order_no,product_name,customer_name,planned_start_date,lot_no)
    values($1,'NEW','合成製品','合成得意先','2026-12-05','KEEP-ACTUAL-LOT') returning id`, [post])).id;
  check((await one('select planned_start_date::text date,lot_no from v_production_schedules_with_master where id=$1', [linked])).date, '2026-12-03');
  check((await one('select planned_start_date::text date,lot_no from v_production_schedules_with_master where id=$1', [linked])).lot_no, 'KEEP-ACTUAL-LOT');
  const standalone = (await one(`insert into production_schedules(order_no,product_name,customer_name,planned_start_date)
    values('STANDALONE','別予定','合成得意先','2026-12-07') returning id`)).id;
  check((await one('select planned_start_date::text date from v_production_schedules_with_master where id=$1', [standalone])).date, '2026-12-07');
  await reject(db.query("update posts set planned_start_date='2026-12-09' where id=$1", [post]), /posts_planned_start_dates_check/);
  await reject(db.query("update posts set planned_start_date='2026-12-11',completion_scheduled_date=null where id=$1", [post]), /posts_planned_start_dates_check/);
  await db.query('update posts set planned_start_date=null where id=$1', [post]);
  check((await one('select planned_start_date from posts where id=$1', [post])).planned_start_date, null);

  // Future archives protect non-NULL planned dates, while actual lot metadata remains untouched.
  const dated = await oldOrder('DATED-ARCHIVE');
  await db.query("update posts set planned_start_date=(now()-interval '4 years 5 days')::date,updated_at=now()-interval '4 years' where id=$1", [dated]);
  const datedPacket = (await one('select prepare_history_export($1) packet', [dated])).packet;
  check(Object.hasOwn(datedPacket.payload.anchors.post, 'planned_start_date'), true);
  check((await one('select execute_history_retention($1,$2,false) result', [datedPacket.export_id, datedPacket.payload])).result.archived, true);
  await reject(db.query('update posts set planned_start_date=null where id=$1', [dated]), /退避済み/);
  check((await one('select execute_history_retention($1,$2,true) result', [datedPacket.export_id, datedPacket.payload])).result.restored, true);
  check((await one('select app_private.history_packet($1) packet', [dated])).packet, datedPacket.payload);
  check((await one("select has_function_privilege('anon','app_private.history_packet(uuid)','execute') ok")).ok, false);
  console.log(JSON.stringify({ mode: 'isolated planned-start schema, view identity, date limits and old/new archive restoration', passed }));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, where: error.where, detail: error.detail }));
  process.exitCode = 1;
} finally { await db.close(); }
