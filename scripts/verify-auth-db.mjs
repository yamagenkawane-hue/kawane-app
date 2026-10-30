import fs from 'node:fs';
const base=fs.readFileSync('scripts/verify-outsource-transfer.mjs','utf8');
const extra=String.raw`
  {
    const flow=await fixture();
    const remainderFlow=await fixture();
    const admin='00000000-0000-0000-0000-000000000001',worker='00000000-0000-0000-0000-000000000002';
    const adminSession='10000000-0000-0000-0000-000000000001',workerSession='10000000-0000-0000-0000-000000000002';
    await db.exec(@@SQL@@create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create table auth.sessions(id uuid primary key,user_id uuid);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;
      create table public."user"(id uuid primary key,name text,pass text,manager boolean,"delete" boolean);
      create view v_auth_test as select * from posts;
      create function order_has_process_progress(p_post_id uuid) returns boolean language sql security definer as $$select false;$$;
      create function soft_delete_lot(p_lot_id uuid) returns void language plpgsql security definer as $$begin update lots set deleted=true where id=p_lot_id; end$$;
    @@SQL@@);
    await db.query("insert into auth.users values($1,'a@example.invalid'),($2,'b@example.invalid')",[admin,worker]);
    await db.query('insert into public."user" values($1,\'admin\',\'placeholder\',true,false),($2,\'worker\',\'placeholder\',false,false)',[admin,worker]);
    await db.query('insert into auth.sessions values($1,$2),($3,$4)',[adminSession,admin,workerSession,worker]);
    await db.exec('alter table order_processes add column planned_amount integer default 100');
    await db.exec(fs.readFileSync('supabase/migrations/20261029_outsource_remainder_schedules.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261030070357_secure_auth_and_permissions.sql','utf8'));
    const claims=async(id,session,role='authenticated')=>{
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,role})]);
      await db.exec('set role '+role);
    };
    await db.exec('set role anon');
    await reject(db.query('select * from posts'),/permission denied/);
    await reject(db.query('select * from v_auth_test'),/permission denied/);
    await reject(db.query('select transfer_lot_to_next_process($1,$2,1,null,\'unauth\',\'2026-10-16\')',[flow.lot,flow.source]),/permission denied/);
    await reject(db.query('select * from public."user"'),/permission denied/);
    await db.exec('reset role');await claims(worker,workerSession);
    check((await db.query('select * from posts')).rows.length>0,true);
    check((await db.query('select * from v_auth_test')).rows.length>0,true);
    check((await db.query('select id,login_id,manager,active from app_profiles')).rows.length,1);
    await reject(db.query('select auth_email from app_profiles'),/permission denied/);
    await reject(db.query('update app_profiles set manager=true'),/permission denied/);
    await reject(db.query('insert into process_master(outsourcing) values(true)'),/row-level security/);
    await reject(db.query('select soft_delete_lot($1)',[flow.lot]),/権限/);
    await reject(db.query('select consume_login_attempt(\'x\')'),/permission denied/);
    const dispatch='20000000-0000-0000-0000-000000000001';
    await db.query('select save_outsource_remainder_schedule($1,$2,20,\'2026-10-13\',\'2026-10-15\',\'2026-10-16\',null,null,false)',[dispatch,remainderFlow.source]);passed++;
    await db.query('select transfer_outsource_remainder_lot($1,$2,$3,20,\'2026-10-13\',\'2026-10-15\',\'2026-10-16\',\'auth-remainder\')',[dispatch,remainderFlow.lot,remainderFlow.source]);
    check((await one('select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2',[remainderFlow.lot,remainderFlow.source])).quantity,80);
    check((await one('select order_has_process_progress($1) value',[flow.post])).value,false);
    await transfer(flow,{key:'authenticated-flow'});
    check((await one('select completed_amount from order_processes where id=$1',[flow.source])).completed_amount,100);
    await db.exec('reset role');await claims(admin,adminSession);
    await db.query('insert into process_master(outsourcing) values(true)');passed++;
    await db.query('select soft_delete_lot($1)',[flow.lot]);passed++;
    await db.exec('reset role');
    await reject(db.query('update app_profiles set active=false where id=$1',[admin]),/最後/);
    await reject(db.query('update app_profiles set manager=false where id=$1',[admin]),/最後/);
    await db.query('update app_profiles set active=false where id=$1',[worker]);
    await claims(worker,workerSession);
    check((await db.query('select * from posts')).rows.length,0);
    await reject(db.query('select order_has_process_progress($1)',[flow.post]),/権限/);
    await db.exec('reset role');
    await db.query('update app_profiles set active=true where id=$1',[worker]);
    await db.query('delete from auth.sessions where id=$1',[workerSession]);
    await claims(worker,workerSession);
    check((await db.query('select * from posts')).rows.length,0);
    await db.exec('reset role');
    for(let i=0;i<16;i++) check((await one("select consume_login_attempt('limit') ok")).ok,i<15);
    check((await one("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not relrowsecurity")).n,0);
  }
`;
// The string uses escaped template delimiters so the inherited fixture can execute it.
const expanded=extra.replaceAll('@@SQL@@',String.fromCharCode(96));
const marker='  console.log(JSON.stringify({mode:"in-memory PostgreSQL",passed},null,2));';
const source=base.replace(marker,()=>expanded+marker);
try {await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
catch(error){console.error(error.message,error.position,error.where,error.internalQuery);process.exitCode=1;}
