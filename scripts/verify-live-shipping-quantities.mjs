// Read-only verification using a normal member session. No shipments or stock are changed.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
process.loadEnvFile('.env.local');
const origin=process.env.KAWANE_VERIFY_ORIGIN || 'http://localhost:3000';
const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loginId:'test',password:process.env.KAWANE_TEST_MIGRATION_PASSWORD})});
assert.equal(response.status,200,'Member login must succeed');
const session=await response.json();
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
await client.auth.setSession(session);
function load(file){const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const {fetchAllRows}=load('lib/fetchAllRows.ts');
const {buildShippingStockMaps}=load('lib/shippingQuantity.ts');
const {buildShippedAmountMap}=load('lib/orderVisibility.ts');
let passed=1;
try {
 const results=await Promise.all([
  fetchAllRows((from,to)=>client.from('v_shipping_candidates').select('post_id,order_no,lot_id,order_amount,current_stock,available_quantity').gt('available_quantity',0).order('post_id').order('lot_id').range(from,to)),
  fetchAllRows((from,to)=>client.from('shipments').select('post_id,order_no,quantity,cancelled').or('cancelled.is.null,cancelled.eq.false').order('id').range(from,to)),
  fetchAllRows((from,to)=>client.from('inventory_items').select('id,lot_id,current_stock,allocated_stock').order('id').range(from,to)),
  fetchAllRows((from,to)=>client.from('inventory_allocations').select('post_id,inventory_item_id,allocated_amount,shipped_amount').order('id').range(from,to)),
  fetchAllRows((from,to)=>client.from('customer_master').select('id,customer_name,shipping_offset_days,note').order('id').range(from,to)),
 ]);
 for(const result of results){assert.equal(result.error,null);passed++;}
 const [candidates,shipments,inventory,allocations]=results.map(r=>r.data);
 const shipped=buildShippedAmountMap(candidates.map(r=>({id:r.post_id,order_no:r.order_no})),shipments);
 const maps=buildShippingStockMaps(inventory,allocations);
 for(const row of candidates){
  const remaining=Math.max(Number(row.order_amount)-(shipped.get(row.post_id)||0),0);
  const stock=(maps.freeByLot.get(row.lot_id)||0)+(maps.ownByOrderLot.get(`${row.post_id}:${row.lot_id}`)||0);
  assert.equal(Math.min(remaining,stock),Number(row.available_quantity),'Displayed quantities must agree with live shipping view');passed++;
 }
 console.log(JSON.stringify({mode:'live member reads, no business writes',passed,candidateRows:candidates.length}));
} finally {await client.auth.signOut({scope:'local'});}
