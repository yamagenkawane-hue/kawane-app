// Synthetic data only; no network or production database access.
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let passed = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); passed++; };
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); passed++; };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table posts(id uuid primary key default gen_random_uuid(),order_no text,product_id uuid,customer_id uuid,
      product_code text,product_name text,customer_name text,order_amount integer,delivery_date date,
      completion_scheduled_date date,"delete" boolean default false,updated_at timestamptz);
    create view v_posts_with_master as select * from posts;
    create table order_processes(id uuid primary key default gen_random_uuid(),post_id uuid,product_id uuid,
      product_code text,product_name text,process_name text,process_order integer,locked boolean default false,
      completed_amount integer default 0,completed_date date,outsource_sent_date date,outsource_returned_date date,updated_at timestamptz);
    create table production_schedules(id uuid primary key default gen_random_uuid(),post_id uuid,order_no text);
    create table lots(id uuid primary key default gen_random_uuid(),post_id uuid,product_id uuid,product_code text,
      product_name text,lot_no text,deleted boolean default false,inventory_amount integer default 0,
      allocated_amount integer default 0,shipped_amount integer default 0,last_shipped_at date,status text,
      created_at timestamptz default now(),updated_at timestamptz);
    create table inventory_items(id uuid primary key default gen_random_uuid(),lot_id uuid,product_id uuid,
      product_code text,product_name text,lot_no text,current_stock integer check(current_stock>=0),
      allocated_stock integer default 0 check(allocated_stock>=0),updated_at timestamptz);
    create table inventory_allocations(id uuid primary key default gen_random_uuid(),post_id uuid,product_id uuid,product_code text,
      inventory_item_id uuid,lot_id uuid,lot_no text,allocated_amount integer,shipped_amount integer default 0 check(shipped_amount>=0),confirmed_at timestamptz);
    create table shipments(id uuid primary key default gen_random_uuid(),post_id uuid,product_id uuid,customer_id uuid,
      order_no text,customer_name text,product_name text,lot_id uuid,lot_no text,scheduled_date date,delivery_date date,
      order_amount integer,quantity integer,cancelled boolean default false,cancelled_at timestamptz,
      cancelled_reason text,created_at timestamptz default now(),updated_at timestamptz);
    create table production_results(id uuid primary key default gen_random_uuid(),schedule_id uuid,post_id uuid,
      order_process_id uuid,lot_id uuid,process_id text,process_name text,date date,amount integer,created_at timestamptz);
    create table lot_process_balance(id uuid primary key default gen_random_uuid(),post_id uuid,order_process_id uuid,
      lot_id uuid,process_name text,process_order integer,quantity integer,source_result_id uuid,created_at timestamptz,updated_at timestamptz);
    create table process_transfer_history(id uuid primary key default gen_random_uuid(),post_id uuid,lot_id uuid,
      from_order_process_id uuid,to_order_process_id uuid,from_process_name text,to_process_name text,
      from_process_order integer,to_process_order integer,quantity integer,movement_type text,source_result_id uuid,
      before_from_quantity integer,after_from_quantity integer,before_to_quantity integer,after_to_quantity integer,
      correction_quantity integer,reason text,idempotency_key text unique,created_at timestamptz);
  `);
  for (const file of ["20260907_fix_shipment_cancellation_inventory_columns.sql", "20261020_process_transfer_actual_date.sql",
    "20261026_safe_shipping_and_order_cancellation.sql", "20261026_progress_completion.sql"]) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  // Migration can be reapplied without losing the legacy restoration function.
  await db.exec(fs.readFileSync("supabase/migrations/20261026_safe_shipping_and_order_cancellation.sql", "utf8"));
  const post = async (name, amount = 100) => (await one("insert into posts(order_no,product_code,order_amount) values($1,'TEST',$2) returning id",[name,amount])).id;
  const lot = async (postId, qty, code = "TEST") => {
    const id=(await one("insert into lots(post_id,product_code,lot_no,inventory_amount) values($1,$2,'LOT', $3) returning id",[postId,code,qty])).id;
    const inventory=(await one("insert into inventory_items(lot_id,product_code,lot_no,current_stock) values($1,$2,'LOT',$3) returning id",[id,code,qty])).id;
    return {id,inventory};
  };
  const ship = (postId,lotId,qty,key) => one("select (register_shipment($1,$2,$3,'2026-10-20',$4)).*",[postId,lotId,qty,key]);
  const cancel = (id) => db.query("select cancel_shipment_and_restore_inventory($1,'test')",[id]);
  const stock = async (id) => (await one("select current_stock from inventory_items where id=$1",[id])).current_stock;
  const remaining = async (id) => Number((await one("select order_amount-(select coalesce(sum(quantity),0) from shipments where post_id=p.id and cancelled is not true) as n from posts p where id=$1",[id])).n);
  const a=await post("A"), l=await lot(a,120);
  const first=await ship(a,l.id,30,"first");
  await reject(db.query("delete from inventory_items where id=$1",[l.inventory]),/出荷取消に必要/);
  check(await stock(l.inventory),90); check(await remaining(a),70);
  check((await ship(a,l.id,30,"first")).id,first.id); check(await stock(l.inventory),90);
  await reject(ship(a,l.id,31,"first"),/処理キー/);
  await reject(ship(a,l.id,71,"over"),/注残/);
  await reject(ship(a,l.id,0,"zero"),/出荷数量/);
  const last=await ship(a,l.id,70,"last");
  check(await remaining(a),0); check(await stock(l.inventory),20);
  check((await one('select "delete" from posts where id=$1',[a])).delete,false);
  check(Number((await one("select available_quantity from v_shipping_candidates where post_id=$1",[a])).available_quantity),0);
  await cancel(last.id); check(await remaining(a),70); check(await stock(l.inventory),90);
  await cancel(last.id); check(await stock(l.inventory),90);
  await cancel(first.id); check(await stock(l.inventory),120);
  check((await one("select count(*)::int n from shipments where post_id=$1",[a])).n,2);

  // Other orders' reservations are never consumed, and reversal restores exact allocations.
  const b=await post("B"), other=await post("OTHER"), shared=await lot(b,100);
  const own=(await one("insert into inventory_allocations(post_id,inventory_item_id,lot_id,allocated_amount) values($1,$2,$3,30) returning id",[b,shared.inventory,shared.id])).id;
  await db.query("insert into inventory_allocations(post_id,inventory_item_id,lot_id,allocated_amount) values($1,$2,$3,40)",[other,shared.inventory,shared.id]);
  await db.query("update inventory_items set allocated_stock=70 where id=$1",[shared.inventory]);
  await reject(ship(b,shared.id,61,"short"),/在庫が不足/);
  check(await stock(shared.inventory),100);
  check((await one("select shipped_amount from inventory_allocations where id=$1",[own])).shipped_amount,0);
  const reserved=await ship(b,shared.id,50,"reserved");
  check(await stock(shared.inventory),50);
  check((await one("select allocated_stock from inventory_items where id=$1",[shared.inventory])).allocated_stock,40);
  const free=await ship(b,shared.id,10,"free");
  await cancel(free.id);
  check((await one("select shipped_amount from inventory_allocations where id=$1",[own])).shipped_amount,30);
  await cancel(reserved.id); check(await stock(shared.inventory),100);
  check((await one("select allocated_stock from inventory_items where id=$1",[shared.inventory])).allocated_stock,70);
  const wrong=await lot(b,100,"OTHER");
  await reject(ship(b,wrong.id,1,"wrong"),/製品が一致/);
  const unknown=await lot(b,10,null);
  await reject(ship(b,unknown.id,1,"unknown-product"),/製品が一致/);
  const sameNo=await lot(b,10);
  await ship(b,sameNo.id,5,"selected"); check(await stock(shared.inventory),100); check(await stock(sameNo.inventory),5);

  // An insert failure rolls back stock and allocation changes too.
  await db.exec("create function fail_shipment_test() returns trigger language plpgsql as $$ begin if new.idempotency_key='fail-insert' then raise exception 'synthetic insert failure'; end if; return new; end $$; create trigger fail_test before insert on shipments for each row execute function fail_shipment_test();");
  await reject(ship(b,sameNo.id,1,"fail-insert"),/synthetic insert/); check(await stock(sameNo.inventory),5);

  const empty=await post("MISTAKE");
  await db.query("insert into order_processes(post_id,process_name) values($1,'製造')",[empty]);
  await db.query("select soft_delete_order_post($1)",[empty]);
  check((await one('select "delete" from posts where id=$1',[empty])).delete,true);
  check((await one("select count(*)::int n from order_processes where post_id=$1",[empty])).n,1);
  await reject(ship(empty,l.id,1,"deleted"),/有効な注番/);
  await reject(db.query("insert into production_results(post_id,amount) values($1,1)",[empty]),/取消済み/);
  await reject(db.query("insert into lots(post_id) values($1)",[empty]),/取消済み/);
  await reject(db.query("select soft_delete_order_post($1)",[a]),/削除できません/);
  await reject(db.query('update posts set "delete"=true where id=$1',[b]),/削除できません/);
  const legacy=await post("LEGACY");
  await db.query("insert into shipments(order_no,quantity,cancelled) values('LEGACY',10,true)");
  await reject(db.query("select soft_delete_order_post($1)",[legacy]),/削除できません/);
  const actual=await post("ACTUAL");
  await db.query("insert into production_results(post_id,amount) values($1,10)",[actual]);
  await reject(db.query("select soft_delete_order_post($1)",[actual]),/削除できません/);

  // Measurement completion creates dated actuals and stock together, retry is harmless.
  const c=await post("MEASURE"), cLot=await lot(c,0);
  const measure=(await one("insert into order_processes(post_id,process_name,process_order,product_code) values($1,'計量',4,'TEST') returning id",[c])).id;
  const pack=(await one("insert into order_processes(post_id,process_name,process_order,product_code) values($1,'梱包',5,'TEST') returning id",[c])).id;
  await db.query("insert into lot_process_balance(post_id,order_process_id,lot_id,quantity) values($1,$2,$3,100)",[c,measure,cLot.id]);
  const complete=()=>db.query("select complete_lot_from_progress($1,$2,95,'数量補正','finish','2026-10-20')",[cLot.id,measure]);
  await db.query("update order_processes set locked=true where id=$1",[pack]);
  await reject(complete(),/locked|ロック/i);
  check((await one("select quantity from lot_process_balance where order_process_id=$1",[measure])).quantity,100);
  check((await one("select count(*)::int n from production_results where post_id=$1",[c])).n,0);
  await db.query("update order_processes set locked=false where id=$1",[pack]);
  await complete(); await complete(); check(await stock(cLot.inventory),95);
  check((await one("select count(*)::int n from production_results where post_id=$1 and date='2026-10-20'",[c])).n,2);
  check((await one("select sum(quantity)::int n from lot_process_balance where post_id=$1",[c])).n,0);
  check((await one("select completed_amount from order_processes where id=$1",[pack])).completed_amount,95);
  const pending=await lot(c,0);
  await db.query("insert into lot_process_balance(post_id,order_process_id,lot_id,quantity) values($1,$2,$4,10),($1,$3,$4,20)",[c,measure,pack,pending.id]);
  await reject(db.query("select complete_lot_from_progress($1,$2,10,'test','pending','2026-10-20')",[pending.id,measure]),/梱包待ち/);
  check((await one("select sum(quantity)::int n from lot_process_balance where lot_id=$1",[pending.id])).n,30);

  // Existing shipments (without movement metadata) retain the legacy cancellation path.
  const old=await post("OLD"), oldLot=await lot(old,5);
  const oldShipment=(await one("insert into shipments(post_id,lot_id,lot_no,quantity,scheduled_date) values($1,$2,'LOT',5,'2026-10-01') returning id",[old,oldLot.id])).id;
  await cancel(oldShipment); check(await stock(oldLot.inventory),10);
  check((await one("select has_function_privilege('anon','register_shipment(uuid,uuid,integer,date,text)','execute') as allowed")).allowed,false);
  check((await one("select has_function_privilege('service_role','register_shipment(uuid,uuid,integer,date,text)','execute') as allowed")).allowed,true);
  // Completed production remains outstanding until shipment and can be allocated.
  const allocPost=await post("ALLOC-COMPLETED",25);
  await db.query("insert into order_processes(post_id,process_name,completed_amount,process_order) values($1,'梱包',25,5)",[allocPost]);
  await db.query("select confirm_inventory_allocation($1)",[allocPost]);
  check((await one("select sum(allocated_amount)::int n from inventory_allocations where post_id=$1",[allocPost])).n,25);
  await reject(db.query("select confirm_inventory_allocation($1)",[allocPost]),/すでに/);
  await reject(db.query("select confirm_inventory_allocation($1)",[empty]),/有効な注番/);
  console.log(JSON.stringify({mode:"synthetic in-memory PostgreSQL",passed},null,2));
} finally { await db.close(); }
