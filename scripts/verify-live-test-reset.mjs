// Read-only verification of the authorised reset; never changes remote records.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import {createClient} from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
const root=process.argv[2];
const before=JSON.parse(await fs.readFile(`${root}/before-reset.json`,"utf8")).tables;
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});
const tables={};
const sorted=rows=>rows.map(row=>JSON.stringify(row,Object.keys(row).sort())).sort();
for(const name of Object.keys(before)) {
  const rows=[];
  const firstKey=Object.keys(before[name][0]||{id:0})[0];
  const order=name==="company_calendar"?"date":firstKey;
  for(let from=0;;from+=1000) {
    const {data,error}=await db.from(name).select("*").order(order).range(from,from+999);
    if(error) throw Error(`${name}: ${error.message}`);
    rows.push(...data);
    if(data.length<1000) break;
  }
  tables[name]=rows;
}
const masters=["customer_master","product_master","product_processes","process_master","material_master",
  "line_master","subcontractors","company_calendar","ai_prediction_settings","ai_prediction_reference_starts"];
for(const name of masters) assert.deepEqual(sorted(tables[name]),sorted(before[name]),`Master changed: ${name}`);
assert.equal(tables.posts.length,10);
assert.ok(tables.posts.every(row=>/^T26-\d{3}$/.test(row.order_no)));
assert.equal(tables.order_processes.length,50);
assert.equal(tables.production_schedules.length,30);
assert.equal(tables.inventory_items.reduce((sum,row)=>sum+row.current_stock,0),315);
assert.equal(tables.shipments.filter(row=>!row.cancelled).reduce((sum,row)=>sum+row.quantity,0),110);
assert.equal(tables.ai_prediction_latest.length,0);
assert.equal(tables.ai_prediction_runs.length,0);
const {data:candidates,error}=await db.from("v_shipping_candidates").select("post_id,lot_id,lot_no,current_stock,available_quantity").gt("available_quantity",0);
if(error) throw error;
const report={checkedAt:new Date().toISOString(),mastersUnchanged:masters,
  counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),
  orders:tables.posts.map(p=>({orderNo:p.order_no,amount:p.order_amount,
    shipped:tables.shipments.filter(s=>s.post_id===p.id&&!s.cancelled).reduce((sum,s)=>sum+s.quantity,0)})).sort((a,b)=>a.orderNo.localeCompare(b.orderNo)),
  shippingCandidateCount:candidates.length};
await fs.writeFile(`${root}/after-reset-verification.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
