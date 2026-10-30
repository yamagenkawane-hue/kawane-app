// Read-only: back up application data before the explicitly authorised test reset.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error("Database configuration missing");
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const response = await fetch(`${url}/rest/v1/`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
if (!response.ok) throw Error(`Schema inspection failed (${response.status})`);
const schema = await response.json();
const definitions = schema.definitions || {};
const operations = ["posts","order_processes","production_schedules","lots","production_results",
  "lot_process_balance","process_transfer_history","inventory_items","inventory_allocations","shipments",
  "ai_prediction_latest","ai_prediction_results","ai_prediction_input_snapshots","ai_prediction_evaluations",
  "ai_prediction_runs","legacy_post_process_logs_archive"];
const masters = ["customer_master","product_master","product_processes","process_master","material_master",
  "line_master","subcontractors","company_calendar","ai_prediction_settings","ai_prediction_reference_starts"];
const tables={};
for (const table of [...operations,...masters].filter(name=>definitions[name])) {
  const columns=definitions[table].properties;
  const order=columns.id ? "id" : Object.keys(columns)[0];
  const rows=[];
  for (let from=0;;from+=1000) {
    const result=await db.from(table).select("*").order(order).range(from,from+999);
    if(result.error) throw Error(`${table}: ${result.error.message}`);
    rows.push(...result.data);
    if(result.data.length<1000) break;
  }
  tables[table]=rows;
}
const directory=path.join(os.tmpdir(),`kawane-test-reset-${new Date().toISOString().replaceAll(/[:.]/g,"-")}`);
await fs.mkdir(directory,{recursive:true});
const backup={project:new URL(url).hostname,createdAt:new Date().toISOString(),tables};
const content=JSON.stringify(backup,null,2);
await fs.writeFile(path.join(directory,"before-reset.json"),content);
await fs.writeFile(path.join(directory,"schema.json"),JSON.stringify(schema,null,2));
const report={directory,sha256:crypto.createHash("sha256").update(content).digest("hex"),
  counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),
  otherTables:Object.keys(definitions).filter(name=>!name.startsWith("v_") && ![...operations,...masters,"user"].includes(name)),
  activeRuns:tables.ai_prediction_runs?.filter(row=>row.status==="running").map(row=>row.id),
  products:tables.product_master?.map(({id,product_code,product_name})=>({id,product_code,product_name})),
  newShippingApplied:!!definitions.shipments?.properties?.inventory_movements};
await fs.writeFile(path.join(directory,"report.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
