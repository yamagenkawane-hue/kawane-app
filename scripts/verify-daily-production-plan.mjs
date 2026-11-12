// Per-order plan override, atomic date save and master isolation in a synthetic DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {setup,flow} from './fixtures/preproduction-db.mjs';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const reject=async(fn,p)=>{await assert.rejects(fn,p);passed++;};
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
try{
 await setup(db);const a=await flow(db,'PLAN-A'),b=await flow(db,'PLAN-B'),c=await flow(db,'PLAN-C');
 const product=(await one("insert into product_master(product_name,product_code,plan_amount) values('SYNTHETIC','PLAN',100) returning id")).id;
 for(const f of [a,b,c]){
  await db.query('update posts set product_id=$1 where id=$2',[product,f.post]);
  await db.query('update production_schedules set product_id=$1 where post_id=$2',[product,f.post]);
 }
 const packet=(await one('select app_private.history_packet($1) value',[a.post])).value;
 await db.exec(fs.readFileSync('supabase/migrations/20261112111343_per_order_production_plan.sql','utf8'));
 check((await one('select app_private.history_packet($1) value',[a.post])).value,packet);
 const plan=async f=>Number((await one('select product_plan_amount n from v_production_schedules_with_master where post_id=$1 and department=$2',[f.post,'製造G'])).n);
 check(await plan(a),100);check(await plan(b),100);
 await db.query("select save_daily_department_dates($1,'2026-10-10','2026-10-11','2026-10-12',150)",[a.post]);
 check(await plan(a),150);check(await plan(b),100);check(Number((await one('select plan_amount n from product_master where id=$1',[product])).n),100);
 check(Number((await one('select order_amount n from posts where id=$1',[a.post])).n),100);
 const own=await one('select plan_amount,press_completed_amount,planned_start_date::text from production_schedules where id=$1',[a.schedule]);
 check(Number(own.plan_amount),100);check(Number(own.press_completed_amount),0);check(own.planned_start_date,'2026-10-01');
 // Calls from an older client still work and retain the per-order override.
 await db.query("select save_daily_department_dates($1,'2026-10-10','2026-10-11','2026-10-12')",[a.post]);check(await plan(a),150);
 await db.query("select save_daily_department_dates($1,'2026-10-10','2026-10-11','2026-10-12',0)",[a.post]);check(await plan(a),0);
 await reject(()=>db.query('select save_daily_department_dates($1,null,null,null,-1)',[a.post]),/0以上/);check(await plan(a),0);
 await db.exec(`create function fail_plan_save() returns trigger language plpgsql as $$begin if new.department='品質管理G' then raise exception 'injected second save failure'; end if; return new; end$$;
 create trigger fail_plan_save before update on production_schedules for each row execute function fail_plan_save();`);
 await reject(()=>db.query("select save_daily_department_dates($1,'2026-10-20','2026-10-21','2026-10-22',200)",[a.post]),/injected/);
 check(await plan(a),0);check((await one('select press_completed_date::text date from production_schedules where id=$1',[a.schedule])).date,'2026-10-10');
 await db.exec('drop trigger fail_plan_save on production_schedules');
 await db.query("select save_daily_department_dates($1,'2026-10-20','2026-10-21','2026-10-22',200)",[a.post]);check(await plan(a),200);
 // A plan-only edit creates the manufacturing row without inventing dates/actuals.
 await db.query('delete from production_schedules where id=$1',[c.schedule]);
 await db.query('insert into shipments(post_id,quantity,cancelled) values($1,50,false)',[c.post]);
 await db.query('select save_daily_department_dates($1,null,null,null,75)',[c.post]);check(await plan(c),75);
 const created=await one('select plan_amount,press_completed_amount,press_completed_date from production_schedules where post_id=$1',[c.post]);
 check(Number(created.plan_amount),50);check(Number(created.press_completed_amount),0);check(created.press_completed_date,null);
 check((await one("select has_function_privilege('anon','public.save_daily_department_dates(uuid,date,date,date,integer)','EXECUTE') allowed")).allowed,false);
 check((await one("select has_function_privilege('authenticated','public.save_daily_department_dates(uuid,date,date,date,integer)','EXECUTE') allowed")).allowed,true);
 console.log(JSON.stringify({mode:'per-order plan, zero, master/order/actual isolation, rollback and old-client defaults',passed}));
}catch(error){console.error(error.message,error.detail||'',error.where||'');process.exitCode=1;}finally{await db.close();}
