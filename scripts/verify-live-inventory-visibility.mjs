// Read-only inventory-list verification. Never ships, allocates, cancels or deletes stock.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const origin=process.env.KAWANE_VERIFY_ORIGIN||'http://localhost:3000';
function load(file){const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const {fetchAllRows}=load('lib/fetchAllRows.ts'),{isInventoryVisible}=load('lib/inventoryVisibility.ts');
const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loginId:'test',password:process.env.KAWANE_TEST_MIGRATION_PASSWORD})});assert.equal(r.status,200);
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});await client.auth.setSession(await r.json());
try{
 const result=await fetchAllRows((from,to)=>client.from('v_inventory_items_with_master').select('id,product_code,product_name,lot_no,current_stock,allocated_stock,updated_at').order('updated_at',{ascending:false}).order('id').range(from,to));
 assert.equal(result.error,null);const visible=result.data.filter(row=>isInventoryVisible({currentStock:Number(row.current_stock||0),allocatedStock:Number(row.allocated_stock||0)}));
 for(const row of visible)assert.ok(Number(row.current_stock)>Number(row.allocated_stock||0));
 console.log(JSON.stringify({mode:'live inventory reads only',total:result.data.length,visible:visible.length,hidden:result.data.length-visible.length}));
}finally{await client.auth.signOut({scope:'local'})}
