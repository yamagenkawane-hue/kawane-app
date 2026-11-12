// Disposable PostgreSQL-in-WASM only; no live users, credentials or business writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {setup,flow,manufacture} from './fixtures/preproduction-db.mjs';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite(),uid=n=>`80000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const reject=async(fn,p)=>{await assert.rejects(fn,p);passed++;};
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const claims=async(id=uid(1),role='authenticated',session=uid(11))=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(id?{sub:id,session_id:session}:{})})]);
try{
 await setup(db);
 await db.exec(`create table app_profiles(id uuid primary key,login_id text,active boolean,manager boolean);
 create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create or replace function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create or replace function app_private.is_member(p_manager boolean default false) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.app_profiles p join auth.sessions s on s.user_id=p.id where p.id=auth.uid() and p.active and (not p_manager or p.manager) and s.id::text=auth.jwt()->>'session_id')$$;
 create or replace function app_private.assert_access(p_manager boolean default false) returns void language plpgsql security definer as $$begin
 if auth.jwt()->>'role'='service_role' then return; end if;
 if not app_private.is_member(p_manager) then raise exception 'denied' using errcode='42501'; end if; end $$;
 grant usage on schema auth to authenticated;
 `);
 await db.query('insert into app_profiles values($1,\'manager\',true,true),($2,\'worker\',true,false)',[uid(1),uid(2)]);
 await db.query('insert into auth.sessions values($1,$2),($3,$4)',[uid(11),uid(1),uid(12),uid(2)]);
 await db.exec(`alter table app_profiles enable row level security;
 grant select(id,login_id,manager,active) on app_profiles to authenticated;
 create policy profile_self_read on app_profiles for select to authenticated using(id=auth.uid() and app_private.is_member(false));`);
 await claims();const legacy=await flow(db,'LEGACY');const oldLot=(await manufacture(db,legacy,100,'legacy')).lot_id;
 await db.query('update process_transfer_history set created_by=$1 where lot_id=$2',[uid(1),oldLot]);
 const oldPacket=(await one('select app_private.history_packet($1) packet',[legacy.post])).packet;
 await db.exec(fs.readFileSync('supabase/migrations/20261112101651_lot_history_actor_display_names.sql','utf8'));
 check((await one('select app_private.history_packet($1) packet',[legacy.post])).packet,oldPacket);
 await db.query("update app_profiles set display_name='担当者A' where id=$1",[uid(1)]);
 const f=await flow(db,'ACTORS');
 for(const table of ['posts','order_processes','production_schedules'])await db.query(`update ${table} set product_id=$1 where ${table==='posts'?'id':'post_id'}=$2`,[uid(99),f.post]);
 const manufactured=await manufacture(db,f,100,'actors');
 const get=async(lot)=> (await db.query('select * from get_lot_history_actors($1)',[lot])).rows;
 let rows=await get(manufactured.lot_id);
 check(rows.some(r=>r.source_table==='production_results'&&r.actor_name==='担当者A'),true);
 check(rows.filter(r=>r.source_table==='production_results').every(r=>r.actor_name==='担当者A'),true);
 check(rows.some(r=>r.source_table==='process_transfer_history'&&r.actor_name==='担当者A'),true);
 await db.query("update app_profiles set display_name='担当者B' where id=$1",[uid(1)]);
 check((await get(manufactured.lot_id)).filter(r=>r.source_table==='production_results').every(r=>r.actor_name==='担当者A'),true);
 // The old explicit ID is resolved; no snapshots are fabricated for unknown old results.
 rows=await get(oldLot);check(rows.some(r=>r.source_table==='process_transfer_history'&&r.actor_name==='担当者B'),true);
 check(rows.some(r=>r.source_table==='production_results'),false);
 for(const i of [1,2])await db.query("select transfer_lot_to_next_process($1,$2,100,null,$3,'2026-10-25')",[manufactured.lot_id,f.processes[i],`actor-move-${i}`]);
 rows=await get(manufactured.lot_id);check(rows.some(r=>r.source_table==='inventory_items'&&r.actor_name==='担当者B'),true);
 const shipment=(await one("select * from register_shipment($1,$2,10,'2026-10-26','actor-ship')",[f.post,manufactured.lot_id]));
 await claims(uid(2),'authenticated',uid(12));
 await db.query("select cancel_shipment_and_restore_inventory($1,'synthetic')",[shipment.id]);
 rows=await get(manufactured.lot_id);check(rows.find(r=>r.source_table==='shipments'&&r.event_kind==='record').actor_name,'担当者B');
 check(rows.find(r=>r.source_table==='shipments'&&r.event_kind==='cancel').actor_name,'worker');
 // Each outsourcing date retains its own editor, including split dispatches.
 await db.query("update order_processes set outsource_sent_date='2026-10-20' where id=$1",[f.processes[1]]);
 await claims();await db.query("update order_processes set outsource_returned_date='2026-10-25' where id=$1",[f.processes[1]]);
 rows=await get(manufactured.lot_id);check(rows.find(r=>r.source_id===f.processes[1]&&r.event_kind==='outsource_sent_date').actor_name,'worker');
 check(rows.find(r=>r.source_id===f.processes[1]&&r.event_kind==='outsource_returned_date').actor_name,'担当者B');
 await claims(uid(2),'authenticated',uid(12));
 const dispatch=(await one("insert into outsource_remainder_schedules(id,order_process_id,dispatch_no,quantity,sent_date) values(gen_random_uuid(),$1,1,20,'2026-10-20') returning id",[f.processes[1]])).id;
 await claims();await db.query("update outsource_remainder_schedules set returned_date='2026-10-25' where id=$1",[dispatch]);
 rows=await get(manufactured.lot_id);
 check(rows.find(r=>r.source_id===dispatch&&r.event_kind==='sent_date').actor_name,'worker');
 check(rows.find(r=>r.source_id===dispatch&&r.event_kind==='returned_date').actor_name,'担当者B');
 // Caller-supplied legacy created_by cannot override the session-derived snapshot.
 await db.query('update process_transfer_history set created_by=$1 where lot_id=$2',[uid(2),manufactured.lot_id]);
 check((await get(manufactured.lot_id)).filter(r=>r.source_table==='process_transfer_history').every(r=>r.actor_name!=='worker'),true);
 await claims(null,'service_role');await db.query('update inventory_items set current_stock=current_stock+1 where lot_id=$1',[manufactured.lot_id]);
 check((await get(manufactured.lot_id)).find(r=>r.source_table==='inventory_items').actor_name,'システム');
 const stock=Number((await one('select current_stock from inventory_items where lot_id=$1',[manufactured.lot_id])).current_stock);
 await db.exec(`create function app_private.fail_actor_snapshot() returns trigger language plpgsql as $$begin raise exception 'injected actor failure'; end$$;
 create trigger fail_actor_snapshot before insert on app_private.lot_history_actor_snapshots for each row execute function app_private.fail_actor_snapshot();`);
 await reject(()=>db.query('update inventory_items set current_stock=current_stock+1 where lot_id=$1',[manufactured.lot_id]),/injected/);
 check(Number((await one('select current_stock from inventory_items where lot_id=$1',[manufactured.lot_id])).current_stock),stock);
 await db.exec('drop trigger fail_actor_snapshot on app_private.lot_history_actor_snapshots');
 // Archive metadata survives round-trip, and restore operators never replace it.
 const packet=(await one('select app_private.history_packet($1) packet',[f.post])).packet;
 check(packet.history_actors.length>0,true);
 await claims(uid(2),'authenticated',uid(12));
 await db.query('select app_private.delete_history_details($1)',[packet]);
 check((await one("select count(*)::int n from app_private.lot_history_actor_snapshots where source_table='process_transfer_history' and source_id in(select (r->>'id')::uuid from jsonb_array_elements($1::jsonb->'tables'->'process_transfer_history') r)",[packet])).n,0);
 await db.query('select app_private.restore_history_details($1)',[packet]);
 check((await one('select app_private.history_packet($1) packet',[f.post])).packet,packet);
 check((await get(manufactured.lot_id)).some(r=>r.source_table==='production_results'&&r.actor_name==='担当者A'),true);
 check((await one('select count(*)::int n from app_private.lot_history_actor_restores')).n,0);
 // Old v1 files with no actor metadata also remain usable and do not gain a
 // fictitious current restorer as the creator of old results.
 await db.query('select app_private.delete_history_details($1)',[oldPacket]);
 await db.query('select app_private.restore_history_details($1)',[oldPacket]);
 check((await one('select app_private.history_packet($1) packet',[legacy.post])).packet,oldPacket);
 check((await get(oldLot)).some(r=>r.source_table==='production_results'),false);
 await claims();await db.exec('set role authenticated');
 check((await one('select display_name from app_profiles')).display_name,'担当者B');
 check((await one('select count(*)::int n from app_profiles')).n,1);
 await reject(()=>db.query('select * from app_private.lot_history_actor_snapshots'),/permission denied/);
 await reject(()=>db.query('insert into app_private.lot_history_actor_restores values(txid_current())'),/permission denied/);
 await reject(()=>db.query("insert into app_private.lot_history_actor_snapshots values('shipments',$1,'record',null,'fake',now())",[shipment.id]),/permission denied/);
 check((await get(manufactured.lot_id)).length>0,true);
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[uid(11)]);await db.exec('set role authenticated');
 await reject(()=>get(manufactured.lot_id),/denied/);await db.exec('reset role');await db.exec('set role anon');
 await reject(()=>get(manufactured.lot_id),/permission denied/);await db.exec('reset role');
 await reject(()=>db.query("update app_profiles set display_name=repeat('a',101) where id=$1",[uid(1)]),/check constraint/);
 console.log(JSON.stringify({mode:'actor snapshots, display-name changes, session identity, legacy IDs, outsourcing and shipment cancellation',passed}));
}catch(error){console.error(error.message,error.detail||'',error.where||'');process.exitCode=1;}finally{await db.close();}
