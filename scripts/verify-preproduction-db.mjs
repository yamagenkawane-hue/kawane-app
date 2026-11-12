// Only a newly created disposable local PostgreSQL database; no Supabase access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setup, flow, manufacture } from './fixtures/preproduction-db.mjs';
const pg = await import(pathToFileURL(process.argv[2]).href);
const { Client } = pg.default || pg;
const config = { host: '127.0.0.1', port: 55491, user: 'synthetic', database: 'postgres' };
const control = new Client(config);
await control.connect();
const database = `preproduction_${Date.now()}`;
await control.query(`create database ${database}`);
const clients = [];
let passed = 0;
const check = (a,b) => { assert.deepEqual(a,b); passed++; };
const reject = async (fn,pattern) => { await assert.rejects(fn,pattern); passed++; };
try {
  for (let i=0;i<5;i++) { const c=new Client({...config,database}); await c.connect(); c.exec=(sql)=>c.query(sql); clients.push(c); }
  const db=clients[0], one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
  await setup(db);
  await db.exec(fs.readFileSync('supabase/migrations/20261112000417_preproduction_integrity_fixes.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261112000424_sync_workflow_write_boundaries.sql','utf8'));
  const original=[{date:'2026-01-01',name:'original',is_holiday:true,type:'company'}];
  const replacement=[{date:'2026-01-02',name:'new',is_holiday:true,type:'company'}];
  const calendar=(rows)=>db.query('select replace_company_calendar_year(2026,$1)',[JSON.stringify(rows)]);
  await calendar(original);
  await db.exec(`create function fail_calendar() returns trigger language plpgsql as $$begin raise exception 'injected insert failure'; end$$;
    create trigger fail_calendar before insert on company_calendar for each row execute function fail_calendar();`);
  await reject(()=>calendar(replacement),/injected/);
  check((await one('select name from company_calendar')).name,'original');
  await db.exec('drop trigger fail_calendar on company_calendar');
  await calendar(replacement); await calendar(replacement);
  check((await one('select count(*)::int n from company_calendar')).n,1);
  for (const rows of [[],[...replacement,...replacement],[{...replacement[0],date:'2026-02-30'}],[{...replacement[0],date:'2027-01-01'}]]) {
    await reject(()=>calendar(rows),/カレンダー|重複|date|対象年/);
    check((await one('select name from company_calendar')).name,'new');
  }
  const f=await flow(db,'DATES');
  await db.query(`insert into production_schedules(post_id,order_no,department,planned_start_date,press_completed_date) values($1,'DATES','品質管理G','2026-09-01','2026-10-03'),($1,'DATES','梱包出荷G','2026-09-02','2026-10-04')`,[f.post]);
  const dates=()=>db.query(`select save_daily_department_dates($1,'2026-10-10','2026-10-11','2026-10-12')`,[f.post]);
  await db.exec(`create function fail_department() returns trigger language plpgsql as $$begin if new.department='品質管理G' then raise exception 'injected second department failure'; end if; return new; end$$;
    create trigger fail_department before update on production_schedules for each row execute function fail_department();`);
  await reject(dates,/injected/);
  check((await one('select press_completed_date from production_schedules where id=$1',[f.schedule])).press_completed_date,null);
  await db.exec('drop trigger fail_department on production_schedules');
  await dates(); await dates();
  const plans=(await db.query('select department,planned_start_date::text,press_completed_date::text from production_schedules where post_id=$1 order by department',[f.post])).rows;
  check(plans.length,3); check(plans.map(r=>r.planned_start_date).sort(),['2026-09-01','2026-09-02','2026-10-01']);
  check(plans.map(r=>r.press_completed_date).sort(),['2026-10-10','2026-10-11','2026-10-12']);
  const fresh=await flow(db,'NEW-DEPARTMENTS');
  await db.query("update posts set planned_start_date='2026-09-20' where id=$1",[fresh.post]);
  await db.query('select save_daily_department_dates($1,null,$2,$3)',[fresh.post,'2026-10-11','2026-10-12']);
  check((await one("select count(*)::int n from production_schedules where post_id=$1 and planned_start_date='2026-09-20'",[fresh.post])).n,2);
  // A journal insert failure rolls back quantities/results and leaves the key retryable.
  const rollback=await flow(db,'ROLLBACK-TRANSFER');
  const rollbackLot=(await manufacture(db,rollback,100,'rollback-manufacture')).lot_id;
  await db.exec(`create function fail_movement() returns trigger language plpgsql as $$begin raise exception 'injected movement failure'; end$$;
    create trigger fail_movement before insert on process_transfer_history for each row execute function fail_movement();`);
  const rollbackTransfer=()=>db.query("select * from transfer_lot_to_next_process($1,$2,100,null,'rollback-key','2026-10-25')",[rollbackLot,rollback.processes[1]]);
  await reject(rollbackTransfer,/injected/);
  check((await one('select quantity from lot_process_balance where lot_id=$1 and process_order=2',[rollbackLot])).quantity,100);
  check((await one("select count(*)::int n from app_private.process_transfer_requests where request_key='rollback-key'")).n,0);
  await db.exec('drop trigger fail_movement on process_transfer_history');await rollbackTransfer();
  // Mixed upstream dates: later manufacture then earlier manufacture updates the pointer.
  const mixed=await flow(db,'MIXED',40);
  const m=await manufacture(db,mixed,20,'mixed-new','2026-10-22');
  await manufacture(db,mixed,20,'mixed-old','2026-10-20');
  const transfer=(client,lot,process,amount,key,date='2026-10-25',reason=null)=>client.query('select * from transfer_lot_to_next_process($1,$2,$3,$4,$5,$6)',[lot,process,amount,reason,key,date]);
  await reject(()=>transfer(db,m.lot_id,mixed.processes[1],40,'mixed-invalid','2026-10-21'),/前工程/);
  check((await one('select quantity from lot_process_balance where lot_id=$1 and process_order=2',[m.lot_id])).quantity,40);
  await reject(()=>transfer(db,m.lot_id,mixed.processes[1],20,'mixed-loss-invalid','2026-10-21','loss'),/前工程/);
  await transfer(db,m.lot_id,mixed.processes[1],40,'mixed-valid','2026-10-22');
  // Five independent sessions contend on exactly the same request key.
  for (const terminal of [false,true]) {
    const f2=await flow(db,terminal?'STOCK-CONCURRENT':'TRANSFER-CONCURRENT');
    const lot=(await manufacture(db,f2,100,`${f2.post}-manufacture`)).lot_id;
    if(terminal) await transfer(db,lot,f2.processes[1],100,`${f2.post}-inspect`);
    const process=f2.processes[terminal?2:1], key=`${f2.post}-parallel`;
    const blocker=new Client({...config,database});await blocker.connect();
    let pending;
    try {
      await blocker.query('begin');
      await blocker.query("select pg_advisory_xact_lock(hashtextextended('process-transfer:'||$1,0))",[key]);
      pending=Promise.all(clients.map(c=>transfer(c,lot,process,100,key)));
      const pids=clients.map(c=>c.processID);
      let waiting=0;
      for(let i=0;i<100;i++) {
        waiting=Number((await blocker.query("select count(*) n from pg_stat_activity where pid=any($1::integer[]) and wait_event='advisory'",[pids])).rows[0].n);
        if(waiting===5)break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      check(waiting,5);
    } finally {await blocker.query('commit');await blocker.end();}
    const results=await pending;
    check(results.map(r=>JSON.stringify(r.rows[0])).every(r=>r===JSON.stringify(results[0].rows[0])),true);
    check((await one('select count(*)::int n from process_transfer_history where idempotency_key=$1',[key])).n,1);
    await reject(()=>transfer(db,lot,process,99,key),/異なる/);
    await reject(()=>transfer(db,lot,process,100,key,'2026-10-24'),/異なる/);
    await reject(()=>transfer(db,lot,process,100,key,'2026-10-25','changed'),/異なる/);
    if(terminal) check((await one('select current_stock from inventory_items where lot_id=$1',[lot])).current_stock,100);
    // Compatibility retry for a request created before the response cache existed.
    await db.query('delete from app_private.process_transfer_requests where request_key=$1',[key]);
    check((await transfer(db,lot,process,100,key)).rows[0].movement_history_id,results[0].rows[0].movement_history_id);
    await reject(()=>transfer(db,lot,process,101,key),/異なる/);
  }
  // A different payload racing on the same key must never receive false success.
  const race=await flow(db,'PAYLOAD-RACE'), lot=(await manufacture(db,race,100,'race-manufacture')).lot_id;
  const raceResults=await Promise.allSettled(clients.map((c,i)=>transfer(c,lot,race.processes[1],i?99:100,'race-key','2026-10-25','adjust')));
  const successes=raceResults.filter(r=>r.status==='fulfilled');
  check(successes.length===1||successes.length===4,true);
  check(raceResults.filter(r=>r.status==='rejected').every(r=>/異なる/.test(r.reason.message)),true);
  check((await one("select count(*)::int n from process_transfer_history where idempotency_key='race-key'")).n,1);
  // Recreated grants must deny direct workflow bypass for authenticated workers.
  await db.exec('set role authenticated');
  for (const sql of ["update posts set \"delete\"=true",'update lots set deleted=true','update shipments set cancelled=true','insert into shipments(quantity) values(1)']) await reject(()=>db.query(sql),/permission denied/);
  await db.exec('reset role');
  check((await one("select has_column_privilege('authenticated','posts','order_no','UPDATE') allowed")).allowed,true);
  console.log(JSON.stringify({mode:'isolated PostgreSQL 18, five independent sessions, rollback and workflow boundaries',passed}));
} finally {
  await Promise.all(clients.map(c=>c.end()));
  await control.query(`drop database ${database} with(force)`);
  await control.end();
}
