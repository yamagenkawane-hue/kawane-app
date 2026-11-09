// Synthetic in-memory PostgreSQL only. No network or live business writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let passed = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); passed++; };
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); passed++; };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const read = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
const migration = read('20261109091308_product_scoped_lot_numbers.sql');
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let serial = 0;
async function flow(product, stages = 3, name = `ORDER-${++serial}`) {
  const post = (await one(`insert into posts(order_no,product_id,product_code,product_name,customer_name,order_amount,"delete")
    values($1,$2,$3,$4,'SYNTHETIC',100,false) returning id`, [name, product.id, product.code, product.name])).id;
  const schedule = (await one(`insert into production_schedules(post_id,order_no,product_id,product_name,press_completed_amount)
    values($1,$2,$3,$4,0) returning id`, [post, name, product.id, product.name])).id;
  const processes = [];
  for (let n = 1; n <= stages; n++) {
    processes.push((await one(`insert into order_processes(post_id,order_no,product_id,product_code,product_name,customer_name,
      process_name,process_order,planned_amount,completed_amount,locked) values($1,$2,$3,$4,$5,'SYNTHETIC',$6,$7,100,0,false) returning id`,
    [post, name, product.id, product.code, product.name, n === 1 ? '製造' : n === stages ? '梱包' : '検査', n])).id);
  }
  return { post, schedule, processes };
}
const manufacture = (f, amount, lot, key, material = null, date = '2026-10-20', schedule = f.schedule) =>
  one('select * from register_manufacturing_lot_result($1,$2,$3,$4,$5,$6,$7)',
    [f.processes[0], schedule, date, amount, lot, material, key]);
const transfer = (f, lot, index, amount, key) => one("select * from transfer_lot_to_next_process($1,$2,$3,null,$4,'2026-10-25')", [lot, f.processes[index], amount, key]);
const stock = async (lot) => Number((await one('select coalesce(sum(current_stock),0) n from inventory_items where lot_id=$1', [lot])).n);
const amount = async (f) => Number((await one('select completed_amount n from order_processes where id=$1', [f.processes[0]])).n);
const a = { id: uid(1), code: 'PRODUCT-A', name: '製品A' };
const b = { id: uid(2), code: 'PRODUCT-B', name: '製品B' };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$select '${uid(99)}'::uuid$$;
    create function app_private.is_member(boolean default false) returns boolean language sql stable as $$
      select coalesce(current_setting('test.member',true),'yes')='yes' $$;
    create function app_private.assert_access(boolean default false) returns void language plpgsql as $$
      begin if not app_private.is_member(false) then raise exception '権限なし'; end if; end $$;
    grant usage on schema app_private to authenticated;
  `);
  await db.exec(fs.readFileSync('scripts/fixtures/lot-identity-schema.sql', 'utf8'));
  await db.exec(read('20260901_distinguish_lots_by_material_lot.sql'));
  await db.exec(read('20260907_fix_shipment_cancellation_inventory_columns.sql'));
  await db.exec(read('20261020_process_transfer_actual_date.sql'));
  await db.exec(read('20261026_safe_shipping_and_order_cancellation.sql'));
  await db.exec(read('20261102100906_history_retention_management.sql'));
  // Simulate the existing public RPC ACL, then ensure replacement preserves it.
  await db.exec(`revoke all on function register_manufacturing_lot_result(uuid,uuid,date,integer,text,text,text) from public,anon;
    grant execute on function register_manufacturing_lot_result(uuid,uuid,date,integer,text,text,text) to authenticated;`);
  const fa = await flow(a), fb = await flow(b);
  const la = await manufacture(fa, 100, 'SAME-NO', 'a-initial');
  await reject(manufacture(fb, 100, 'SAME-NO', 'b-initial'), /lots_lot_no_key/);
  // Reproduce the old failure, then verify the migration fixes the real constraint.
  await db.exec(migration);
  await db.exec(migration); // schema/function replacement is safe to repeat
  const lb = await manufacture(fb, 100, 'SAME-NO', 'b-initial');
  check(la.lot_id !== lb.lot_id, true);
  check(await amount(fa), 100); check(await amount(fb), 100);
  check((await one('select count(*)::int n from lots where lot_no=$1', ['SAME-NO'])).n, 2);
  await transfer(fa, la.lot_id, 1, 100, 'a-inspection');
  check(Number((await one('select quantity n from lot_process_balance where lot_id=$1 and process_order=2', [lb.lot_id])).n), 100);
  await transfer(fa, la.lot_id, 2, 100, 'a-stock');
  await transfer(fb, lb.lot_id, 1, 100, 'b-inspection');
  await transfer(fb, lb.lot_id, 2, 100, 'b-stock');
  check(await stock(la.lot_id), 100); check(await stock(lb.lot_id), 100);
  await reject(one("select * from register_shipment($1,$2,1,'2026-10-26','wrong-product')", [fa.post, lb.lot_id]), /製品が一致/);
  check(await stock(lb.lot_id), 100);
  const shipment = await one("select * from register_shipment($1,$2,40,'2026-10-26','a-shipment')", [fa.post, la.lot_id]);
  check(await stock(la.lot_id), 60); check(await stock(lb.lot_id), 100);
  await db.query("select cancel_shipment_and_restore_inventory($1,'synthetic')", [shipment.id]);
  check(await stock(la.lot_id), 100); check(await stock(lb.lot_id), 100);
  // Allocation is by product and lot UUID, never by a shared lot label.
  const allocatedOrder = await flow(a, 1);
  await db.query('select confirm_inventory_allocation($1)', [allocatedOrder.post]);
  check((await one('select count(*)::int n from inventory_allocations where post_id=$1 and lot_id=$2', [allocatedOrder.post, lb.lot_id])).n, 0);
  check((await one('select coalesce(sum(allocated_amount),0)::int n from inventory_allocations where post_id=$1', [allocatedOrder.post])).n, 100);

  // Repeated same-order/material input accumulates; separate material lots remain distinct.
  const fm = await flow(a, 1);
  const m1 = await manufacture(fm, 10, 'MATERIAL-NO', 'material-1', 'MAT-A');
  const m1again = await manufacture(fm, 5, 'MATERIAL-NO', 'material-2', 'MAT-A');
  const m2 = await manufacture(fm, 20, 'MATERIAL-NO', 'material-3', 'MAT-B');
  check(m1.lot_id, m1again.lot_id); check(m1.lot_id !== m2.lot_id, true);
  check(await stock(m1.lot_id), 15); check(await stock(m2.lot_id), 20);
  check((await one('select press_completed_amount n from production_schedules where id=$1', [fm.schedule])).n, 35);
  await manufacture(fm, 20, 'MATERIAL-NO', 'material-3', 'MAT-B');
  check(await stock(m2.lot_id), 20);
  await reject(manufacture(fb, 20, 'MATERIAL-NO', 'material-3', 'MAT-B'), /処理キー/);
  await reject(manufacture(fm, 21, 'MATERIAL-NO', 'material-3', 'MAT-B'), /処理キー/);
  await reject(manufacture(fm, 1, 'X', 'wrong-schedule', null, '2026-10-20', fb.schedule), /製造予定と注番/);
  check(await amount(fm), 35);
  await reject(db.query('select deduct_inventory($1,$2,1)', [a.code, 'MATERIAL-NO']), /一意に特定/);
  check(await stock(m1.lot_id), 15); check(await stock(m2.lot_id), 20);
  await reject(db.query('update inventory_items set product_id=$1,product_code=$2,product_name=$3 where lot_id=$4', [b.id, b.code, b.name, m1.lot_id]), /製造ロットと一致/);
  await reject(db.query("update inventory_items set lot_no='OTHER' where lot_id=$1", [m1.lot_id]), /製造ロットと一致/);
  await reject(db.query('insert into inventory_items(lot_id,product_id,product_code,product_name,lot_no) values($1,$2,$3,$4,$5)', [m1.lot_id, a.id, a.code, a.name, 'MATERIAL-NO']), /inventory_items_lot_identity_idx/);
  // Same display name still has separate product UUIDs and inventory.
  const fc = await flow({ ...b, name: a.name }, 1);
  const c1 = await manufacture(fc, 7, 'MATERIAL-NO', 'same-display-name');
  check(await stock(c1.lot_id), 7); check(await stock(m1.lot_id), 15);
  // A second order never merges into another order's lot, even for the same product.
  const fd = await flow(a, 1);
  const d1 = await manufacture(fd, 8, 'MATERIAL-NO', 'other-order', 'MAT-A');
  check(d1.lot_id !== m1.lot_id, true); check(await stock(d1.lot_id), 8);

  // Old shipments with no movement metadata must not guess among material lots.
  const fl = await flow(a, 1);
  const l1 = await manufacture(fl, 10, 'LEGACY-SAME', 'legacy-one', 'ONE');
  const l2 = await manufacture(fl, 20, 'LEGACY-SAME', 'legacy-two', 'TWO');
  const legacyShipment = (await one("insert into shipments(post_id,product_id,product_name,lot_no,quantity,cancelled) values($1,$2,$3,'LEGACY-SAME',5,false) returning id", [fl.post, a.id, a.name])).id;
  await reject(db.query("select cancel_shipment_and_restore_inventory($1,'test')", [legacyShipment]), /複数/);
  check(await stock(l1.lot_id), 10); check(await stock(l2.lot_id), 20);
  await db.query('update shipments set lot_id=$1 where id=$2', [l1.lot_id, legacyShipment]);
  await db.query("select cancel_shipment_and_restore_inventory($1,'test')", [legacyShipment]);
  check(await stock(l1.lot_id), 15); check(await stock(l2.lot_id), 20);
  const fp = await flow(a, 2);
  await manufacture(fp, 10, 'PACKAGING-ID', 'packaging-id');
  await reject(db.query("select register_order_process_result($1,null,'2026-10-25',1,null,false)", [fp.processes[1]]), /梱包登録には製造ロット/);

  // Schedule errors roll back the complete registration (no hidden first commit).
  const ff = await flow(a, 1);
  await db.exec(`create function fail_schedule_test() returns trigger language plpgsql as $$begin raise exception 'synthetic schedule failure';end$$;
    create trigger fail_schedule_test before update on production_schedules for each row execute function fail_schedule_test();`);
  await reject(manufacture(ff, 10, 'ROLLBACK-NO', 'rollback-key'), /schedule failure/);
  check(await amount(ff), 0);
  for (const table of ['lots', 'production_results', 'process_transfer_history']) {
    check((await one(`select count(*)::int n from ${table} where post_id=$1`, [ff.post])).n, 0);
  }
  await db.exec('drop trigger fail_schedule_test on production_schedules');
  await manufacture(ff, 10, 'ROLLBACK-NO', 'rollback-key');
  check(await amount(ff), 10);
  check((await one('select press_completed_amount n from production_schedules where id=$1', [ff.schedule])).n, 10);

  // Old finished order A can be archived while another product with the same label is active.
  const old = await flow(a, 1);
  const oldLot = (await one(`insert into lots(post_id,product_id,product_code,product_name,customer_name,lot_no,quantity,measured_amount,packaged_amount,shipped_amount,inventory_amount,updated_at)
    values($1,$2,$3,$4,'SYNTHETIC','ARCHIVE-NO',100,100,100,100,0,now()-interval '4 years') returning id`, [old.post, a.id, a.code, a.name])).id;
  await db.query("update posts set created_at=now()-interval '4 years',updated_at=now()-interval '4 years' where id=$1", [old.post]);
  await db.query("update order_processes set completed_amount=100,completed_date=(now()-interval '4 years')::date,updated_at=now()-interval '4 years' where post_id=$1", [old.post]);
  await db.query("insert into shipments(post_id,lot_id,quantity,cancelled,created_at,updated_at,scheduled_date) values($1,$2,100,false,now()-interval '4 years',now()-interval '4 years',(now()-interval '4 years')::date)", [old.post, oldLot]);
  const active = await flow(b, 1);
  const activeLot = await manufacture(active, 15, 'ARCHIVE-NO', 'active-archive-number');
  check((await one('select app_private.history_eligibility($1) info', [old.post])).info.eligible, true);
  const legacyB = (await one('insert into inventory_items(product_id,product_code,product_name,lot_no,current_stock) values($1,$2,$3,$4,5) returning id', [b.id, b.code, b.name, 'ARCHIVE-NO'])).id;
  check((await one('select app_private.history_eligibility($1) info', [old.post])).info.eligible, true);
  const legacyA = (await one('insert into inventory_items(product_id,product_code,product_name,lot_no,current_stock) values($1,$2,$3,$4,5) returning id', [a.id, a.code, a.name, 'ARCHIVE-NO'])).id;
  check((await one('select app_private.history_eligibility($1) info', [old.post])).info.reason, 'ロットに在庫または引当残があります');
  await db.query('delete from inventory_items where id=$1', [legacyA]);
  await db.query("insert into production_results(post_id,order_process_id,lot_id,date,amount,created_at) values($1,$2,$3,(now()-interval '4 years')::date,100,now()-interval '4 years')", [old.post, old.processes[0], oldLot]);
  const packet = (await one('select prepare_history_export($1) packet', [old.post])).packet;
  check((await one('select execute_history_retention($1,$2,false) result', [packet.export_id, packet.payload])).result.archived, true);
  await db.query('update inventory_items set current_stock=current_stock+1 where lot_id=$1', [activeLot.lot_id]);
  await db.query('update inventory_items set current_stock=current_stock+1 where id=$1', [legacyB]);
  check(await stock(activeLot.lot_id), 16);
  await reject(db.query('insert into inventory_items(lot_id,product_id,product_code,product_name,lot_no) values($1,$2,$3,$4,$5)', [oldLot, a.id, a.code, a.name, 'ARCHIVE-NO']), /退避済み/);
  await reject(db.query('insert into inventory_items(product_id,product_code,product_name,lot_no) values($1,$2,$3,$4)', [a.id, a.code, a.name, 'ARCHIVE-NO']), /退避済み/);
  check((await one("select has_function_privilege('anon','public.register_manufacturing_lot_result(uuid,uuid,date,integer,text,text,text)','execute') ok")).ok, false);
  check((await one("select has_function_privilege('authenticated','app_private.inventory_matches_lot(public.inventory_items,public.lots)','execute') ok")).ok, false);
  await db.query("select set_config('test.member','no',false)");
  await reject(manufacture(fm, 1, 'DENIED', 'denied'), /権限/);

  // Pure client identity contracts, including ambiguous legacy rows.
  function load(file) {
    const context = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
    return context.exports;
  }
  const { manufacturingPostId, productionResultErrorComment } = load('lib/manufacturingIdentity.ts');
  const posts = [{ id: 'a', orderNo: 'A', productId: a.id, productName: a.name, lotNo: 'SAME' }, { id: 'b', orderNo: 'B', productId: b.id, productName: b.name, lotNo: 'SAME' }];
  check(manufacturingPostId({ id: 'manual', orderNo: 'B', lotNo: 'SAME' }, posts), 'b');
  check(manufacturingPostId({ id: 'manual', lotNo: 'SAME' }, posts), '');
  check(manufacturingPostId({ id: 'manual', postId: 'a', productId: b.id }, posts), '');
  check(manufacturingPostId({ id: 'manual', postId: 'missing', orderNo: 'B' }, posts), '');
  check(manufacturingPostId({ id: 'manual', orderNo: 'A' }, [...posts, { ...posts[0], id: 'c' }]), '');
  check(productionResultErrorComment({ code: '23505', message: 'other_index' }, 'SAME').includes('別のロットNo'), false);
  const { lotHistoryBelongsTo } = load('lib/lotHistoryIdentity.ts');
  const lot = { id: 'a', postId: 'pa', lotNo: 'SAME,(COMMA)' };
  check(lotHistoryBelongsTo({ lot_id: 'a', post_id: 'pb' }, lot, false), true);
  check(lotHistoryBelongsTo({ lot_id: 'b', post_id: 'pa', lot_no: lot.lotNo }, lot, true), false);
  check(lotHistoryBelongsTo({ post_id: 'pb', lot_no: lot.lotNo }, lot, true), false);
  check(lotHistoryBelongsTo({ post_id: 'pa', lot_no: lot.lotNo }, lot, true), true);
  check(lotHistoryBelongsTo({ post_id: 'pa', lot_no: lot.lotNo }, lot, false), false);
  console.log(JSON.stringify({ mode: 'synthetic product/lot identity, stock, shipping reversal and retention', passed }));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, where: error.where, detail: error.detail }));
  process.exitCode = 1;
} finally { await db.close(); }
