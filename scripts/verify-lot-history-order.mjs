// Offline route ordering and actual lot-detail loader; no live data writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
function load(file,mocks={}){
 const context={exports:{},console,require(name){
  if(name in mocks)return mocks[name];
  if(name.endsWith('.css'))return{__esModule:true,default:{}};
  if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts',mocks);
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const master=['製造','洗浄','検査','計量','梱包'].map((name,i)=>({id:`master-${i}`,process_name:name,process_order:i+1}));
const processes=master.map((p,i)=>({...p,id:`order-${i}`,product_process_id:p.id,process_order:10-i}));
const {createLotHistoryOrder,lotPackagingCompletedDate}=load('lib/lotHistoryOrder.ts');
const {lotHistoryReasonText}=load('lib/lotHistoryText.ts');
check(lotHistoryReasonText('Manufacturing result registered and moved automatically'),'製造実績を登録し、次工程へ自動移動しました');
check(lotHistoryReasonText(' Progress screen transfer '),'進捗管理から工程移動');
check(lotHistoryReasonText('進捗管理から数量編集'),'進捗管理から数量編集');
check(lotHistoryReasonText('Custom note / Manufacturing result registered and moved automatically'),'Custom note / Manufacturing result registered and moved automatically');
check(lotHistoryReasonText(null),'');
const route=createLotHistoryOrder(processes,master);
check(route.resolve('order-2','wrong-name',99),3);check(route.last,5);check(route.previous(2),1);
const duplicate=createLotHistoryOrder([{id:'a',process_name:'検査',process_order:2},{id:'b',process_name:'検査',process_order:4}],[]);
check(duplicate.resolve('b','検査'),4);check(duplicate.resolve(null,'検査'),0);check(duplicate.resolve(null,'検査',2),2);
check(lotPackagingCompletedDate([{order_process_id:'order-4',date:'2026-11-12',amount:10}],processes,''),'2026-11-12');
check(lotPackagingCompletedDate([{order_process_id:'order-4',date:'2026-11-10',amount:10},{order_process_id:'order-4',date:'2026-11-12',amount:10}],processes,''),'2026-11-12');
check(lotPackagingCompletedDate([{process_name:'梱包',date:'2026-02-30',amount:10}],processes,''),'');
check(lotPackagingCompletedDate([{process_name:'検査',date:'2026-11-12',amount:10}],processes,''),'');
check(lotPackagingCompletedDate([{process_name:'梱包',date:'2026-11-12',amount:0}],processes,''),'');
check(lotPackagingCompletedDate([],processes,'2026-11-11'),'2026-11-11');
const lot={id:'lot',postId:'post',productId:'product',orderNo:'ORDER',lotNo:'LOT',packagedAt:'',measuredAmount:100,packagedAmount:100,inventoryAmount:0,allocatedAmount:0,shippedAmount:100,createdAt:'2026-11-09',updatedAt:'2026-11-25'};
const results=processes.map((p,i)=>({id:`result-${i}`,lot_id:'lot',order_process_id:p.id,process_name:p.process_name,date:i?'2026-11-12':'2026-11-09',amount:100,created_at:'2026-11-25T00:00:00Z'})).reverse();
const shipments=[{id:'shipment',lot_id:'lot',post_id:'post',quantity:100,delivery_date:'2026-11-20',scheduled_date:'2026-11-18',created_at:'2026-11-12T01:23:45Z'}];
const transfers=processes.map((p,i)=>({id:`transfer-${i}`,from_order_process_id:p.id,to_order_process_id:processes[i+1]?.id,from_process_name:p.process_name,to_process_name:processes[i+1]?.process_name,from_process_order:10-i,to_process_order:9-i,created_at:i?'2026-11-12T09:00:00Z':'2026-11-09T09:00:00Z',quantity:100})).reverse();
const actorFixtures=[{source_table:'production_results',source_id:'result-0',event_kind:'record',actor_name:'製造担当者'},
 {source_table:'process_transfer_history',source_id:'transfer-0',event_kind:'record',actor_name:'製造担当者'},
 {source_table:'shipments',source_id:'shipment',event_kind:'record',actor_name:'出荷担当者'}];
transfers.find(t=>t.id==='transfer-0').reason='Manufacturing result registered and moved automatically';
transfers.find(t=>t.id==='transfer-1').reason='Progress screen transfer';
const values=[lot,[],1,false,'',''],callbacks=[];
let index=0;
const mocks={react:{...require('react'),useState(initial){const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useEffect(){},useMemo:fn=>fn(),useCallback(fn){callbacks.push(fn);return fn;}},
 '@/lib/auth/client':{},'@/app/components/AuthProvider/AuthProvider':{useAppAuth:()=>({profile:{manager:false}})},'next/navigation':{useParams:()=>({id:'lot'})},
 '@/lib/supabase':{__esModule:true,default:{rpc(){return this.from('actor-fixture');},from(table){
  const filters={};
  const q={select(){return q;},order(){return q;},range(){return q;},or(){return q;},eq(key,value){filters[key]=value;return q;},then(resolve,reject){
   const data=table==='actor-fixture'?actorFixtures:table==='lots'?[{id:'lot'}]:table==='product_processes'?master:table==='v_order_processes_with_master'?processes:
    table==='production_results'?results:table==='v_process_transfer_history_with_master'?transfers:
    table==='inventory_items'?[{id:'inventory',current_stock:0,allocated_stock:0,updated_at:'2026-11-12'}]:
    table==='shipments'?shipments:[];
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }};return q;
 }}}
};
const Detail=load('app/lots/[id]/page.tsx',mocks).default;
Detail();await callbacks[0](lot);
check(values[0].packagedAt,'2026-11-12');
check(values[0].lastShippedAt,'2026-11-12T01:23:45Z');
check(values[1].find(r=>r.id==='lot-result-result-0').actorName,'製造担当者');
check(values[1].find(r=>r.id==='transfer-transfer-0').actorName,'製造担当者');
check(values[1].find(r=>r.action==='出荷').actorName,'出荷担当者');
check(values[1].find(r=>r.action==='在庫登録').actorName,'不明');
check(JSON.stringify(values[1].map(r=>r.action).reverse()),JSON.stringify(['製造','工程移動','洗浄','工程移動','検査','工程移動','計量','工程移動','梱包','工程移動','出荷','在庫登録']));
check(values[1].find(r=>r.action==='出荷').date,'2026-11-12T01:23:45Z');
check(values[1].find(r=>r.id==='transfer-transfer-0').detail.includes('製造実績を登録し、次工程へ自動移動しました'),true);
check(values[1].find(r=>r.id==='transfer-transfer-1').detail.includes('進捗管理から工程移動'),true);
check(transfers.find(t=>t.id==='transfer-0').reason,'Manufacturing result registered and moved automatically');
check(values[1].filter(r=>r.id.startsWith('order-result-')).length,0);
shipments.push({...shipments[0],id:'later-shipment',created_at:'2026-11-13T01:00:00Z'},
 {...shipments[0],id:'cancelled-shipment',created_at:'2026-11-14T01:00:00Z',cancelled:true});
await callbacks[0](lot);
check(values[0].lastShippedAt,'2026-11-13T01:00:00Z');
shipments.forEach(row=>{row.cancelled=true;});
await callbacks[0](lot);
check(values[0].lastShippedAt,'');
// No packaging date can be borrowed from another lot or inferred from row update time.
await callbacks[0]({...lot,id:'other-lot'});check(values[0].id,'lot');
console.log(JSON.stringify({mode:'product route ordering, interleaved movement history and lot-specific packaging actual dates',passed}));
