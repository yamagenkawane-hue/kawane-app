// Synthetic PostgreSQL tests: no remote data is read or modified.
import assert from "node:assert/strict";
import fs from "node:fs";
import {pathToFileURL} from "node:url";
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
let passed=0;
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const reject=async(p,pattern)=>{await assert.rejects(p,pattern);passed++;};
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table posts(id uuid primary key default gen_random_uuid(),"delete" boolean default false);
    create table process_master(id uuid primary key default gen_random_uuid(),outsourcing boolean);
    create table product_processes(id uuid primary key default gen_random_uuid(),process_master_id uuid);
    create table order_processes(id uuid primary key default gen_random_uuid(),post_id uuid,product_id uuid,
      product_code text,product_name text,process_name text,process_order integer,locked boolean default false,
      completed_amount integer default 0,completed_date date,updated_at timestamptz,product_process_id uuid,
      subcontractor_id uuid,outsource_sent_date date,outsource_expected_return_date date,outsource_returned_date date,outsource_status text);
    create table lots(id uuid primary key default gen_random_uuid(),post_id uuid,lot_no text,deleted boolean default false,
      inventory_amount integer default 0,status text,updated_at timestamptz);
    create table lot_process_balance(id uuid primary key default gen_random_uuid(),post_id uuid,order_process_id uuid,lot_id uuid,
      process_name text,process_order integer,quantity integer,source_result_id uuid,created_at timestamptz,updated_at timestamptz);
    create table production_results(id uuid primary key default gen_random_uuid(),schedule_id uuid,post_id uuid,
      order_process_id uuid,lot_id uuid,process_id text,process_name text,date date,amount integer,created_at timestamptz);
    create table inventory_items(id uuid primary key default gen_random_uuid(),lot_id uuid,product_id uuid,
      product_code text,product_name text,lot_no text,current_stock integer,allocated_stock integer,updated_at timestamptz);
    create table process_transfer_history(id uuid primary key default gen_random_uuid(),post_id uuid,lot_id uuid,
      from_order_process_id uuid,to_order_process_id uuid,from_process_name text,to_process_name text,
      from_process_order integer,to_process_order integer,quantity integer,movement_type text,source_result_id uuid,
      before_from_quantity integer,after_from_quantity integer,before_to_quantity integer,after_to_quantity integer,
      correction_quantity integer,reason text,idempotency_key text unique,created_at timestamptz);
  `);
  for(const file of ["20261020_process_transfer_actual_date.sql","20261026_outsource_dates_and_transfer.sql"])
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`,"utf8"));
  async function fixture(name="メッキ",viaMaster=false) {
    const post=(await one("insert into posts default values returning id")).id;
    let pp=null;
    if(viaMaster) {
      const master=(await one("insert into process_master(outsourcing) values(true) returning id")).id;
      pp=(await one("insert into product_processes(process_master_id) values($1) returning id",[master])).id;
    }
    const source=(await one("insert into order_processes(post_id,process_name,process_order,product_process_id) values($1,$2,2,$3) returning id",[post,name,pp])).id;
    const next=(await one("insert into order_processes(post_id,process_name,process_order) values($1,'検査',3) returning id",[post])).id;
    const lot=(await one("insert into lots(post_id,lot_no) values($1,'TEST') returning id",[post])).id;
    const result=(await one("insert into production_results(post_id,date,amount) values($1,'2026-10-12',100) returning id",[post])).id;
    await db.query("insert into lot_process_balance(post_id,order_process_id,lot_id,quantity,source_result_id) values($1,$2,$3,100,$4)",[post,source,lot,result]);
    return {post,source,next,lot};
  }
  const transfer=(f,{sent="2026-10-13",expected="2026-10-15",returned="2026-10-16",amount=100,key="one"}={})=>
    db.query("select transfer_outsource_lot_with_dates($1,$2,$3,$4,$5,$6,$7)",[f.lot,f.source,amount,sent,expected,returned,key]);
  const f=await fixture();
  await reject(transfer(f,{sent:null}),/すべて入力/);
  await reject(transfer(f,{expected:null}),/すべて入力/);
  await reject(transfer(f,{returned:null}),/すべて入力/);
  await reject(transfer(f,{returned:"2099-01-01"}),/本日以前/);
  await reject(transfer(f,{expected:"2026-10-11"}),/出し日以降/);
  await reject(transfer(f,{returned:"2026-10-11"}),/出し日以降/);
  await reject(transfer(f,{sent:"2026-10-10",expected:"2026-10-11",returned:"2026-10-11"}),/前工程/);
  await reject(transfer(f,{amount:101}),/exceeds/);
  check((await one("select outsource_sent_date from order_processes where id=$1",[f.source])).outsource_sent_date,null);
  await db.query("update order_processes set locked=true where id=$1",[f.source]);
  await reject(transfer(f),/Locked/);
  check((await one("select outsource_returned_date from order_processes where id=$1",[f.source])).outsource_returned_date,null);
  await db.query("update order_processes set locked=false,outsource_sent_date='2026-10-13' where id=$1",[f.source]);
  await reject(transfer(f,{sent:"2026-10-12"}),/更新されています/);
  await transfer(f,{amount:95});
  let row=await one("select outsource_sent_date::text sent,outsource_expected_return_date::text expected,outsource_returned_date::text returned,outsource_status,completed_amount,completed_date::text as work_day from order_processes where id=$1",[f.source]);
  check(row,{sent:"2026-10-13",expected:"2026-10-15",returned:"2026-10-16",outsource_status:"returned",completed_amount:95,work_day:"2026-10-16"});
  check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[f.lot,f.source])).quantity,0);
  check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[f.lot,f.next])).quantity,95);
  check((await one("select correction_quantity from process_transfer_history where idempotency_key='one'")).correction_quantity,5);
  await transfer(f,{amount:95});
  check((await one("select completed_amount from order_processes where id=$1",[f.source])).completed_amount,95);
  await reject(transfer(f,{amount:94}),/異なる工程移動/);
  await reject(transfer(f,{amount:95,returned:"2026-10-17"}),/異なる工程移動/);
  const normal=await fixture("洗浄");
  await reject(transfer(normal,{key:"normal"}),/外注加工/);
  const master=await fixture("表面処理",true);
  await transfer(master,{key:"master"});
  check((await one("select outsource_status from order_processes where id=$1",[master.source])).outsource_status,"returned");
  const deleted=await fixture();
  await db.query('update posts set "delete"=true where id=$1',[deleted.post]);
  await reject(transfer(deleted,{key:"deleted"}),/有効な注番/);
  const chain=await fixture();
  await db.query("update order_processes set process_name='外注仕上げ' where id=$1",[chain.next]);
  const inspection=(await one("insert into order_processes(post_id,process_name,process_order) values($1,'検査',4) returning id",[chain.post])).id;
  await transfer(chain,{key:"chain-first"});
  await transfer({...chain,source:chain.next},{sent:"2026-10-17",expected:"2026-10-19",returned:"2026-10-20",key:"chain-second"});
  check((await one("select outsource_returned_date::text as result_date from order_processes where id=$1",[chain.source])).result_date,"2026-10-16");
  check((await one("select outsource_returned_date::text as result_date from order_processes where id=$1",[chain.next])).result_date,"2026-10-20");
  check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[chain.lot,inspection])).quantity,100);
  console.log(JSON.stringify({mode:"in-memory PostgreSQL",passed},null,2));
} finally {await db.close();}
