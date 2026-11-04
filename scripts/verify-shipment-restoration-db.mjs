import fs from 'node:fs';
let base=fs.readFileSync('scripts/verify-shipment-closure-db.mjs','utf8');
base=base.replace("await db.exec(fs.readFileSync('supabase/migrations/20261104104723_order_shipment_closure.sql','utf8'));", "await db.exec(fs.readFileSync('supabase/migrations/20261104104723_order_shipment_closure.sql','utf8'));\n  await db.exec(fs.readFileSync('supabase/migrations/20261104110854_restore_shipment_closure.sql','utf8'));");
const extra=String.raw`
  const restore=(id,key='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa')=>one('select (restore_order_shipments($1,$2)).*',[id,key]);
  const stockBeforeRestore=await stock(l.inventory);
  const restored=await restore(log.id);
  check(Boolean(restored.restored_at),true);check(restored.restored_actor_name,'operator');
  check(restored.reason,'在庫不足');check(Number(restored.closed_quantity),50);
  check((await one('select shipment_closed_at from posts where id=$1',[a])).shipment_closed_at,null);
  check(await stock(l.inventory),stockBeforeRestore);
  check((await one('select allocated_stock from inventory_items where id=$1',[l.inventory])).allocated_stock,10);
  check((await one('select allocated_amount from inventory_allocations where id=$1',[aa])).allocated_amount,0);
  check(Number((await one('select count(*) as n from v_shipping_candidates where post_id=$1 and available_quantity>0',[a])).n),1);
  check((await restore(log.id)).restored_at.getTime(),restored.restored_at.getTime());
  await reject(restore(log.id,'22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/すでに復元/);
  await reject(restore(zeroLog.id),/同じ処理キー/);
  await reject(restore('99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/履歴が見つかりません/);
  await db.exec("select set_config('test.uid','',false)");await reject(restore(zeroLog.id,'22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/権限/);
  await db.exec("select set_config('test.uid','11111111-1111-4111-8111-111111111111',false)");
  // A failed completion-flag update must roll back the audit update too.
  await db.exec("create function fail_restore() returns trigger language plpgsql as $fail$ begin if new.shipment_closed_at is null then raise exception 'restore failure'; end if; return new; end $fail$; create trigger zzz_fail_restore before update on posts for each row execute function fail_restore();");
  await reject(restore(zeroLog.id,'22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/restore failure/);
  check((await one('select restored_at from order_shipment_closures where id=$1',[zeroLog.id])).restored_at,null);
  check(Boolean((await one('select shipment_closed_at from posts where id=$1',[zero])).shipment_closed_at),true);
  await db.exec('drop trigger zzz_fail_restore on posts');
  // Normal shipping resumes, and a second closure gets its own immutable original record.
  await ship(a,l.id,10,'after-restore');
  const again=await close(a,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  check(Number(again.closed_quantity),40);
  check(Number((await one('select count(*) as n from order_shipment_closures where post_id=$1',[a])).n),2);
  await restore(log.id); // Delayed retry must not reopen this later closure.
  check(Boolean((await one('select shipment_closed_at from posts where id=$1',[a])).shipment_closed_at),true);
  check((await one('select restored_at from order_shipment_closures where id=$1',[again.id])).restored_at,null);
  await reject(restore(again.id),/同じ処理キー/);
`;
base=base.replace("  // Audit data is readable by members",extra+"  // Audit data is readable by members");
base=base.replace("select count(*) as n from order_shipment_closures')).n),2)","select count(*) as n from order_shipment_closures')).n),3)");
try {await import('data:text/javascript;base64,'+Buffer.from(base).toString('base64'));} catch (error) {console.error(error.message);process.exitCode=1;}
