// Real PostgreSQL permission checks with synthetic data only. No remote connection.
// Reuse the shipping schema and full regression suite, then apply Auth and the fix.
// Run: node scripts/verify-workflow-permissions.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = fs.readFileSync('scripts/verify-safe-shipping.mjs', 'utf8');
const marker = '  console.log(JSON.stringify({mode:"synthetic in-memory PostgreSQL",passed},null,2));';
assert.equal(base.split(marker).length, 2, 'Shipping fixture insertion point must be unique');
const extra = String.raw`
  {
    const baselinePassed = passed;
    const authPost = await post('AUTH-SHIP', 100);
    const authLot = await lot(authPost, 120);
    const untouchedPost = await post('AUTH-CANCEL', 10);
    const adminId = '00000000-0000-0000-0000-000000000001';
    const workerId = '00000000-0000-0000-0000-000000000002';
    const adminSession = '10000000-0000-0000-0000-000000000001';
    const workerSession = '10000000-0000-0000-0000-000000000002';
    await db.exec(@@SQL@@
      alter role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create table auth.sessions(id uuid primary key, user_id uuid);
      create function auth.jwt() returns jsonb language sql stable as
        $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on all functions in schema auth to anon, authenticated, service_role;
      create table public."user"(id uuid primary key,name text,pass text,manager boolean,"delete" boolean);
    @@SQL@@);
    await db.query("insert into auth.users values($1,'admin@example.invalid'),($2,'worker@example.invalid')", [adminId,workerId]);
    await db.query('insert into public."user" values($1,\'admin\',\'synthetic-placeholder\',true,false),($2,\'worker\',\'synthetic-placeholder\',false,false)', [adminId,workerId]);
    await db.query('insert into auth.sessions values($1,$2),($3,$4)', [adminSession,adminId,workerSession,workerId]);
    // Load real lot lifecycle RPCs while avoiding the unrelated UI view's full schema.
    await db.exec('alter table lots add column deleted_at timestamptz, add column deleted_reason text');
    const lotLifecycle = fs.readFileSync('supabase/migrations/20260721_lot_deletion_management.sql','utf8');
    const lotRpcMarker = 'create or replace function soft_delete_lot(p_lot_id uuid)';
    assert.equal(lotLifecycle.split(lotRpcMarker).length,2,'Lot RPC fixture entry point must be unique');
    await db.exec(lotLifecycle.slice(lotLifecycle.indexOf(lotRpcMarker)));
    const legacyShipping = fs.readFileSync('supabase/migrations/20260608_inventory_allocations.sql','utf8');
    const legacyRpcMarker = 'create or replace function ship_inventory_for_post(';
    assert.equal(legacyShipping.split(legacyRpcMarker).length,2,'Legacy shipping RPC entry point must be unique');
    await db.exec(legacyShipping.slice(legacyShipping.indexOf(legacyRpcMarker)));
    for (const file of [
      '20261030070357_secure_auth_and_permissions.sql',
      '20261030072432_pin_workflow_function_search_paths.sql',
      '20261030090416_enforce_workflow_write_boundaries.sql',
    ]) {
      if (file.endsWith('enforce_workflow_write_boundaries.sql')) {
        // A table-level REVOKE alone must not leave an older column grant behind.
        await db.exec('grant update ("delete") on posts to public,anon,authenticated; grant update (deleted) on lots to public,anon,authenticated; grant insert (quantity),update (cancelled) on shipments to public,anon,authenticated');
      }
      await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    }
    check((await one("select has_column_privilege('authenticated','posts','delete','UPDATE') allowed")).allowed,false);
    check((await one("select has_column_privilege('authenticated','lots','deleted','UPDATE') allowed")).allowed,false);
    check((await one("select has_column_privilege('authenticated','shipments','quantity','INSERT') allowed")).allowed,false);
    check((await one("select has_column_privilege('anon','shipments','cancelled','UPDATE') allowed")).allowed,false);
    check((await one("select has_function_privilege('anon','ship_inventory_for_post(uuid,integer)','EXECUTE') allowed")).allowed,false);
    const login = async (id, session, role='authenticated') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id,session_id:session,role})]);
      await db.exec('set role '+role);
    };

    // Critical: API users cannot mutate cancellation state or forge shipment records.
    for (const [id, session] of [[workerId,workerSession],[adminId,adminSession]]) {
      await login(id, session);
      await reject(db.query('update posts set "delete"=true where id=$1',[authPost]), /permission denied/);
      await reject(db.query('update posts set "delete"=false where id=$1',[authPost]), /permission denied/);
      await reject(db.query('update lots set deleted=true where id=$1',[authLot.id]), /permission denied/);
      await reject(db.query('update lots set deleted=false where id=$1',[authLot.id]), /permission denied/);
      await reject(db.query('update lots set deleted_at=now() where id=$1',[authLot.id]), /permission denied/);
      await reject(db.query('update lots set deleted_reason=\'forged\' where id=$1',[authLot.id]), /permission denied/);
      await reject(db.query('select ship_inventory_for_post($1,1)',[authPost]), /permission denied/);
      await reject(db.query('delete from posts where id=$1',[untouchedPost]), /permission denied/);
      await reject(db.query('update v_posts_with_master set "delete"=true where id=$1',[authPost]), /permission denied/);
      await reject(db.query('insert into posts(id,"delete") values($1,false) on conflict(id) do update set "delete"=true',[authPost]), /permission denied/);
      await reject(db.query('insert into lots(id,post_id,deleted) values($1,$2,false) on conflict(id) do update set deleted=true',[authLot.id,authPost]), /permission denied/);
      await reject(db.query('insert into shipments(post_id,lot_id,quantity) values($1,$2,999)',[authPost,authLot.id]), /permission denied/);
      await reject(db.query('update shipments set cancelled=true'), /permission denied/);
      await reject(db.query('update shipments set quantity=999,inventory_movements=\'[]\'::jsonb'), /permission denied/);
      await reject(db.query('delete from shipments'), /permission denied/);
      await reject(db.query('insert into shipments(id,post_id,quantity) values($1,$2,1) on conflict(id) do update set cancelled=true',[oldShipment,authPost]), /permission denied/);
      check((await one('select "delete" from posts where id=$1',[authPost])).delete, false);
      check((await one('select deleted from lots where id=$1',[authLot.id])).deleted, false);
      check(await stock(authLot.inventory), 120);
      // High: everyday updates remain available under the active-member RLS policy.
      await db.query('update posts set customer_name=$2 where id=$1',[authPost,'Updated customer']);
      check((await one('select customer_name from posts where id=$1',[authPost])).customer_name, 'Updated customer');
      await db.query('update lots set lot_no=$2 where id=$1',[authLot.id,'UPDATED-LOT']);
      check((await one('select lot_no from lots where id=$1',[authLot.id])).lot_no, 'UPDATED-LOT');
      await reject(db.query('insert into lots(post_id,lot_no,deleted) values($1,\'FORGED\',true)',[authPost]), /row-level security/);
      await reject(db.query('insert into lots(post_id,lot_no,deleted_at) values($1,\'FORGED\',now())',[authPost]), /row-level security/);
      await reject(db.query('insert into lots(post_id,lot_no,deleted_reason) values($1,\'FORGED\',\'forged\')',[authPost]), /row-level security/);
    }
    await login(adminId,adminSession);
    await reject(db.query('insert into posts(order_no,"delete") values(\'FORGED\',true)'), /row-level security/);
    const created = (await one('insert into posts(order_no,"delete") values(\'SAFE\',false) returning id')).id;
    check((await one('select "delete" from posts where id=$1',[created])).delete, false);
    await db.query('select soft_delete_order_post($1)',[created]);
    check((await one('select "delete" from posts where id=$1',[created])).delete, true);

    await login(workerId,workerSession);
    await reject(db.query('select soft_delete_order_post($1)',[untouchedPost]), /権限/);
    await reject(db.query('select soft_delete_lot($1)',[authLot.id]), /権限/);
    await reject(db.query('select restore_deleted_lot($1)',[authLot.id]), /権限/);
    await reject(db.query('insert into posts(order_no) values(\'WORKER-ORDER\')'), /row-level security/);
    const createdLot = (await one('insert into lots(post_id,lot_no) values($1,\'SAFE-LOT\') returning id',[authPost])).id;
    check((await one('select deleted from lots where id=$1',[createdLot])).deleted, false);
    await login(adminId,adminSession);
    await db.query('select soft_delete_lot($1)',[createdLot]);
    check((await one('select deleted from lots where id=$1',[createdLot])).deleted,true);
    check((await one('select deleted_at is not null as dated from lots where id=$1',[createdLot])).dated,true);
    await reject(db.query('update lots set deleted=false where id=$1',[createdLot]), /permission denied/);
    await db.query('select restore_deleted_lot($1)',[createdLot]);
    check((await one('select deleted from lots where id=$1',[createdLot])).deleted,false);
    check((await one('select deleted_at,deleted_reason from lots where id=$1',[createdLot])),{deleted_at:null,deleted_reason:null});
    await login(workerId,workerSession);
    // Critical: actual RPC implementations keep validation, inventory movements and retries.
    await reject(ship(authPost,authLot.id,0,'auth-zero'), /出荷数量/);
    await reject(ship(authPost,authLot.id,101,'auth-over'), /注残/);
    check(await stock(authLot.inventory), 120);
    const authShipment = await ship(authPost,authLot.id,30,'auth-valid');
    check(await stock(authLot.inventory), 90);
    check((await ship(authPost,authLot.id,30,'auth-valid')).id, authShipment.id);
    check(await stock(authLot.inventory), 90);
    check((await one('select shipped_amount from lots where id=$1',[authLot.id])).shipped_amount,30);
    check((await one('select count(*)::int n from shipments where idempotency_key=\'auth-valid\'')).n,1);
    await reject(cancel(authShipment.id), /権限/);
    check(await stock(authLot.inventory), 90);
    check((await one('select cancelled from shipments where id=$1',[authShipment.id])).cancelled,false);
    await login(adminId,adminSession);
    await cancel(authShipment.id);
    check(await stock(authLot.inventory), 120);
    await cancel(authShipment.id);
    check(await stock(authLot.inventory), 120);
    check((await one('select cancelled from shipments where id=$1',[authShipment.id])).cancelled,true);
    check((await one('select shipped_amount from lots where id=$1',[authLot.id])).shipped_amount,0);
    await reject(db.query('update shipments set cancelled=false where id=$1',[authShipment.id]), /permission denied/);
    check(await stock(authLot.inventory),120);

    // Critical: anonymous, disabled and revoked sessions cannot enter the workflows.
    await login(workerId,workerSession,'anon');
    await reject(ship(authPost,authLot.id,1,'anon'), /permission denied/);
    await reject(db.query('select * from shipments'), /permission denied/);
    await db.exec('reset role');
    await db.query('update app_profiles set active=false where id=$1',[workerId]);
    await login(workerId,workerSession);
    check((await db.query('select * from shipments')).rows.length,0);
    await reject(ship(authPost,authLot.id,1,'inactive'), /権限/);
    await db.exec('reset role');
    await db.query('update app_profiles set active=true where id=$1',[workerId]);
    await login(workerId,workerSession);
    await reject(ship(authPost,authLot.id,1,'revoked'), /権限/);
    await db.exec('reset role');
    check(await stock(authLot.inventory),120);
    check((await one('select count(*)::int n from shipments where idempotency_key in (\'anon\',\'inactive\',\'revoked\')')).n,0);
    // Reapplying the corrective migration must preserve the restricted grants.
    await db.exec(fs.readFileSync('supabase/migrations/20261030090416_enforce_workflow_write_boundaries.sql','utf8'));
    await login(workerId,workerSession);
    await reject(db.query('update lots set deleted=true where id=$1',[authLot.id]), /permission denied/);
    await reject(db.query('insert into shipments(quantity) values(1)'), /permission denied/);
    await db.exec('reset role');
    console.log(JSON.stringify({mode:'isolated PostgreSQL workflow permissions',shippingBaselinePassed:baselinePassed,permissionChecksPassed:passed-baselinePassed},null,2));
  }
`;
const source = base.replace(marker, () => extra.replaceAll('@@SQL@@', String.fromCharCode(96)) + marker);
try {
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
} catch (error) {
  console.error(error.message, error.position, error.where, error.internalQuery);
  process.exitCode = 1;
}
