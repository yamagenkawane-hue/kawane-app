// In-memory PostgreSQL only. Pass the installed PGlite dist/index.js path.
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table order_processes (
      id uuid primary key default gen_random_uuid(), post_id uuid, product_id uuid,
      product_code text, product_name text, process_name text, process_order integer,
      locked boolean default false, completed_amount integer default 0, completed_date date, updated_at timestamptz
    );
    create table lots (
      id uuid primary key default gen_random_uuid(), post_id uuid, deleted boolean default false,
      lot_no text, inventory_amount integer default 0, status text, updated_at timestamptz
    );
    create table lot_process_balance (
      id uuid primary key default gen_random_uuid(), post_id uuid, order_process_id uuid, lot_id uuid,
      process_name text, process_order integer, quantity integer, source_result_id uuid,
      created_at timestamptz, updated_at timestamptz
    );
    create table production_results (
      id uuid primary key default gen_random_uuid(), schedule_id uuid, post_id uuid,
      order_process_id uuid, lot_id uuid, process_id text, process_name text,
      date date, amount integer, created_at timestamptz
    );
    create table inventory_items (
      id uuid primary key default gen_random_uuid(), lot_id uuid, product_id uuid,
      product_code text, product_name text, lot_no text, current_stock integer,
      allocated_stock integer, updated_at timestamptz
    );
    create table process_transfer_history (
      id uuid primary key default gen_random_uuid(), post_id uuid, lot_id uuid,
      from_order_process_id uuid, to_order_process_id uuid, from_process_name text,
      to_process_name text, from_process_order integer, to_process_order integer,
      quantity integer, movement_type text, source_result_id uuid,
      before_from_quantity integer, after_from_quantity integer,
      before_to_quantity integer, after_to_quantity integer, correction_quantity integer,
      reason text, idempotency_key text unique, created_at timestamptz
    );
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20261020_process_transfer_actual_date.sql", "utf8"));
  const ids = (await db.query("select gen_random_uuid() as post, gen_random_uuid() as first, gen_random_uuid() as last, gen_random_uuid() as lot")).rows[0];
  await db.query("insert into order_processes(id,post_id,process_name,process_order,product_code) values ($1,$3,'検査',1,'SYNTHETIC'),($2,$3,'梱包',2,'SYNTHETIC')", [ids.first,ids.last,ids.post]);
  await db.query("insert into lots(id,post_id,lot_no) values($1,$2,'SYNTHETIC')",[ids.lot,ids.post]);
  const arrival = (await db.query("insert into production_results(date,amount) values('2026-09-01',100) returning id")).rows[0].id;
  await db.query("insert into lot_process_balance(post_id,order_process_id,lot_id,quantity,source_result_id) values($1,$2,$3,100,$4)",[ids.post,ids.first,ids.lot,arrival]);
  const transfer = (process, amount, key, date) => db.query(
    "select * from transfer_lot_to_next_process($1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::date)",
    [ids.lot,process,amount,"synthetic",key,date],
  );
  let passed = 0;
  await assert.rejects(transfer(ids.first,100,"future","2099-01-01")); passed++;
  await assert.rejects(transfer(ids.first,100,"missing",null)); passed++;
  await assert.rejects(transfer(ids.first,100,"reversed","2026-08-31")); passed++;
  assert.equal((await db.query("select quantity from lot_process_balance")).rows[0].quantity,100); passed++;
  await transfer(ids.first,100,"transfer","2026-09-02");
  let result = (await db.query("select date::text as day from production_results where order_process_id=$1",[ids.first])).rows[0];
  assert.equal(result.day,"2026-09-02"); passed++;
  const audit = (await db.query("select created_at::date::text as day from process_transfer_history")).rows[0];
  assert.notEqual(audit.day,"2026-09-02"); passed++;
  await transfer(ids.first,100,"transfer","2026-09-02");
  assert.equal((await db.query("select count(*)::int as n from process_transfer_history")).rows[0].n,1); passed++;
  await transfer(ids.last,90,"packaging","2026-09-03");
  assert.equal((await db.query("select current_stock from inventory_items")).rows[0].current_stock,90); passed++;
  assert.equal((await db.query("select completed_date::text as day from order_processes where id=$1",[ids.last])).rows[0].day,"2026-09-03"); passed++;
  assert.equal((await db.query("select correction_quantity from process_transfer_history where idempotency_key='packaging'")).rows[0].correction_quantity,10); passed++;
  // Another lot registered out of chronological order must not move the last date backwards.
  const extra = (await db.query("insert into lots(post_id,lot_no) values($1,'SYNTHETIC-2') returning id",[ids.post])).rows[0].id;
  await db.query("insert into lot_process_balance(post_id,order_process_id,lot_id,quantity) values($1,$2,$3,10)",[ids.post,ids.last,extra]);
  await db.query("select * from transfer_lot_to_next_process($1::uuid,$2::uuid,10,'synthetic','older','2026-09-02'::date)",[extra,ids.last]);
  assert.equal((await db.query("select completed_date::text as day from order_processes where id=$1",[ids.last])).rows[0].day,"2026-09-03"); passed++;
  console.log(JSON.stringify({mode:"in-memory PostgreSQL", passed},null,2));
} finally {
  await db.close();
}
