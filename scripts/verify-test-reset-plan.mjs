// Rehearse the real reset SQL in memory using a read-only backup's column schema.
import fs from "node:fs";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const root=process.argv[3];
const schema=JSON.parse(fs.readFileSync(`${root}/schema.json`,"utf8")).definitions;
const backup=JSON.parse(fs.readFileSync(`${root}/before-reset.json`,"utf8")).tables;
const db=new PGlite();
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for(const name of Object.keys(backup)) {
    const def=schema[name];
    const columns=Object.entries(def.properties).map(([column,p])=>{
      let type=p.format || (p.type==="integer"?"integer":p.type==="boolean"?"boolean":"text");
      if(p.type==="array") type="text[]";
      let value=p.default;
      const defaultSql=value===undefined || String(value).includes("nextval(") ? "" :
        typeof value==="boolean" || typeof value==="number" ? ` default ${value}` :
        /^(now\(\)|gen_random_uuid\(\)|'|ARRAY)/.test(String(value)) ? ` default ${value}` : ` default ${quote(value)}`;
      return `"${column}" ${type}${defaultSql}${def.required?.includes(column)?" not null":""}${column==="id"?" primary key":""}`;
    });
    await db.exec(`create table public."${name}"(${columns.join(",")});`);
    if(backup[name].length) await db.query(`insert into public."${name}" select * from jsonb_populate_recordset(null::public."${name}",$1::jsonb)`,[JSON.stringify(backup[name])]);
  }
  await db.exec("create view v_posts_with_master as select * from posts;");
  for(const migration of ["20260907_fix_shipment_cancellation_inventory_columns.sql","20261020_process_transfer_actual_date.sql",
    "20261026_safe_shipping_and_order_cancellation.sql","20261026_progress_completion.sql"])
    await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,"utf8"));
  await db.exec(`begin;\n${fs.readFileSync("supabase/reset_test_data_20261026.sql","utf8")}\ncommit;`);
  assert.equal((await db.query("select count(*)::int n from posts")).rows[0].n,10);
  assert.equal((await db.query("select count(*)::int n from test_reset_backup_20261026.posts")).rows[0].n,11);
  assert.equal((await db.query("select sum(current_stock)::int n from inventory_items")).rows[0].n,315);
  assert.equal((await db.query("select sum(quantity)::int n from shipments where not cancelled")).rows[0].n,110);
  assert.equal((await db.query("select count(*)::int n from ai_prediction_latest")).rows[0].n,0);
  console.log(JSON.stringify({mode:"in-memory rehearsal with current database columns",success:true,
    orders:(await db.query("select p.order_no,p.order_amount,coalesce(sum(s.quantity) filter(where not s.cancelled),0)::int shipped from posts p left join shipments s on s.post_id=p.id group by p.id order by p.order_no")).rows},null,2));
} finally {await db.close();}
