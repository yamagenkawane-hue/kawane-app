// Optional rehearsal using local schema-only snapshots; never reads/writes live business data.
import fs from 'node:fs';
const base=fs.readFileSync('scripts/rehearse-auth-schema.mjs','utf8');
const insertion=String.raw`
for(const table of tables) if(table.columns.some(column=>column.name==='id')) await db.exec('alter table public.'+quote(table.name)+' add primary key(id)');
await db.exec(fs.readFileSync('supabase/migrations/20261102100906_history_retention_management.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261102101413_history_retention_settings_update.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261102102115_history_retention_restore_lock.sql','utf8'));
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role',sub:'00000000-0000-0000-0000-000000000001'})]);
await db.exec("insert into ai_prediction_settings(id,max_reference_days) values('global',730)");
await db.exec('insert into posts(id,order_no,order_amount,"delete",created_at,updated_at) values(\'00000000-0000-0000-0000-000000000100\',\'RETENTION-ISOLATED\',100,false,now()-interval \'4 years\',now()-interval \'4 years\')');
await db.exec("insert into shipments(id,post_id,order_no,quantity,cancelled,created_at,updated_at) values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000100','RETENTION-ISOLATED',100,false,now()-interval '4 years',now()-interval '4 years')");
await db.exec("insert into order_processes(id,post_id,planned_amount,completed_amount,completed_date,updated_at) values('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000100',100,100,(now()-interval '4 years')::date,now()-interval '4 years')");
await db.exec("insert into production_results(id,post_id,order_process_id,process_id,process_name,date,amount,created_at) values('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000102','M','製造',(now()-interval '4 years')::date,100,now()-interval '4 years')");
await db.query('select preview_history_retention(0)');
const packet=(await db.query("select prepare_history_export('00000000-0000-0000-0000-000000000100') as packet")).rows[0].packet;
await db.query('select execute_history_retention($1,$2,false)',[packet.export_id,packet.payload]);
await db.query('select execute_history_retention($1,$2,true)',[packet.export_id,packet.payload]);
console.log('Retention migration, preview, deletion and restoration succeeded against production table shapes/functions');
`;
await import('data:text/javascript;base64,'+Buffer.from(base.replace('  console.log(',insertion+'  console.log(')).toString('base64'));
