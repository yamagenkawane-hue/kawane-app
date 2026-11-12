// Synthetic database only. Password verification is separately tested at the API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setup, flow } from './fixtures/preproduction-db.mjs';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite(),uid=n=>`90000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const reject=async(fn,p)=>{await assert.rejects(fn,p);passed++;};
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
try{
 await setup(db);
 await db.exec(`create table app_profiles(id uuid primary key,login_id text,active boolean,manager boolean);
 create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create or replace function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create or replace function app_private.is_member(p_manager boolean default false) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.app_profiles p join auth.sessions s on s.user_id=p.id where p.id=auth.uid() and p.active and (not p_manager or p.manager) and s.id::text=auth.jwt()->>'session_id')$$;
 grant usage on schema auth to authenticated;
 `);
 await db.query('insert into app_profiles values($1,\'manager\',true,true),($2,\'worker\',true,false)',[uid(1),uid(2)]);
 await db.query('insert into auth.sessions values($1,$2),($3,$4)',[uid(11),uid(1),uid(12),uid(2)]);
 await db.exec(fs.readFileSync('supabase/migrations/20261112090001_secure_order_cancellation_audit.sql','utf8'));
 const claims=async(role,id=uid(1),session=uid(11))=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:id,session_id:session})]);
 await claims('service_role');
 const f=await flow(db,'DELETE-ONE'),g=await flow(db,'DELETE-GUARDED');
 const cancel=(ids,key=uid(21),actor=uid(1),session=uid(11))=>db.query('select cancel_mistaken_orders($1,$2,$3,$4)',[ids,actor,session,key]);
 await reject(()=>cancel([f.post],uid(21),uid(2),uid(12)),/管理者/);
 await reject(()=>cancel([f.post],uid(21),uid(1),uid(12)),/ログイン/);
 await reject(()=>cancel([f.post,f.post]),/重複/);
 await cancel([f.post]);await cancel([f.post]);
 check((await one('select "delete" from posts where id=$1',[f.post])).delete,true);
 check((await one('select count(*)::int n from order_cancellation_history')).n,1);
 const history=await one('select * from order_cancellation_history');check(history.order_no,'DELETE-ONE');check(history.actor_name,'manager');check(history.order_amount,100);check(history.snapshot.delete,false);
 await reject(()=>cancel([g.post]),/異なる/);
 await reject(()=>cancel([f.post],uid(22)),/取消済み/);
 // The existing business guard still rejects started orders and rolls back a batch.
 await db.query('update order_processes set completed_amount=1 where id=$1',[g.processes[0]]);
 const fresh=await flow(db,'BATCH-ROLLBACK');
 await reject(()=>cancel([fresh.post,g.post],uid(23)),/削除できません/);
 check((await one('select "delete" from posts where id=$1',[fresh.post])).delete,false);
 check((await one('select count(*)::int n from order_cancellation_history')).n,1);
 // Even a failing history write rolls back the cancellation flag.
 await db.exec(`create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'injected audit failure'; end$$;
 create trigger fail_audit before insert on order_cancellation_history for each row execute function fail_audit();`);
 await reject(()=>cancel([fresh.post],uid(24)),/injected/);
 check((await one('select "delete" from posts where id=$1',[fresh.post])).delete,false);
 await db.exec('drop trigger fail_audit on order_cancellation_history');await cancel([fresh.post],uid(24));
 await claims('authenticated');await db.exec('set role authenticated');
 await reject(()=>db.query('select soft_delete_order_post($1)',[g.post]),/permission denied/);
 await reject(()=>cancel([g.post]),/permission denied/);
 check((await one('select count(*)::int n from order_cancellation_history')).n,2);
 await reject(()=>db.query('delete from order_cancellation_history'),/permission denied/);
 await reject(()=>db.query("update order_cancellation_history set actor_name='fake'"),/permission denied/);
 await db.exec('reset role');await claims('authenticated',uid(2),uid(12));await db.exec('set role authenticated');
 check((await one('select count(*)::int n from order_cancellation_history')).n,0);
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[uid(11)]);await claims('service_role');
 await reject(()=>cancel([g.post],uid(25)),/ログイン/);
 console.log(JSON.stringify({mode:'synthetic atomic order cancellation audit, retries, guards, RLS and bypass prevention',passed}));
}finally{await db.close();}
