// Synthetic schema only; call exclusively on an empty disposable database.
import fs from 'node:fs';
export async function setup(db) {
 const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const read = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
  await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; create role authenticated; create role service_role; end if; end$$;
    create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$select '${uid(99)}'::uuid$$;
    create function app_private.is_member(boolean default false) returns boolean language sql stable as $$
      select coalesce(current_setting('test.member',true),'yes')='yes' $$;
    create function app_private.assert_access(boolean default false) returns void language plpgsql as $$
      begin if not app_private.is_member(false) then raise exception '権限なし'; end if; end $$;
    grant usage on schema app_private to authenticated;
  `);
  await db.exec(fs.readFileSync('scripts/fixtures/lot-identity-schema.sql', 'utf8'));
  await db.exec(read('20260901_distinguish_lots_by_material_lot.sql'));
  await db.exec(read('20260907_fix_shipment_cancellation_inventory_columns.sql'));
  await db.exec(read('20261020_process_transfer_actual_date.sql'));
  await db.exec(read('20261026_safe_shipping_and_order_cancellation.sql'));
  await db.exec(read('20261102100906_history_retention_management.sql'));
  // Simulate the existing public RPC ACL, then ensure replacement preserves it.
  await db.exec(`revoke all on function register_manufacturing_lot_result(uuid,uuid,date,integer,text,text,text) from public,anon;
    grant execute on function register_manufacturing_lot_result(uuid,uuid,date,integer,text,text,text) to authenticated;`);

 await db.exec(read('20261109091308_product_scoped_lot_numbers.sql'));
 await db.exec(`alter table posts add column if not exists planned_start_date date;
 alter table production_schedules add column if not exists planned_start_date date;
 create table company_calendar(id uuid default gen_random_uuid() primary key,date date unique,name text,is_holiday boolean,type text);
 grant usage on schema public to authenticated;
 grant select,insert,update,delete on posts,lots,shipments to authenticated;
 `);
 await db.exec(read('20261112000417_preproduction_integrity_fixes.sql'));
 await db.exec(read('20261112000424_sync_workflow_write_boundaries.sql'));
}
export async function flow(db, name, amount=100) {
 const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
 const post=(await one(`insert into posts(order_no,product_name,customer_name,order_amount,"delete") values($1,'SYNTHETIC','SYNTHETIC',$2,false) returning id`,[name,amount])).id;
 const schedule=(await one(`insert into production_schedules(post_id,order_no,product_name,customer_name,department,planned_start_date,plan_amount,press_completed_amount) values($1,$2,'SYNTHETIC','SYNTHETIC','製造G','2026-10-01',$3,0) returning id`,[post,name,amount])).id;
 const processes=[];
 for(let n=1;n<=3;n++) processes.push((await one(`insert into order_processes(post_id,order_no,product_name,customer_name,process_name,process_order,planned_amount,completed_amount,locked) values($1,$2,'SYNTHETIC','SYNTHETIC',$3,$4,$5,0,false) returning id`,[post,name,n===1?'製造':n===2?'検査':'梱包',n,amount])).id);
 return {post,schedule,processes};
}
export async function manufacture(db,f,amount,key,date='2026-10-20') {
 return (await db.query('select * from register_manufacturing_lot_result($1,$2,$3,$4,$5,null,$6)',[f.processes[0],f.schedule,date,amount,f.post,key])).rows[0];
}
