// Offline React and loader verification; no production business data is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let passed=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);passed++;};
const values=[],requests=[];let state=0;
const order=(id,amount=100,extra={})=>({id,order_no:id,order_amount:amount,delivery_date:'2026-12-01',shipment_closed_at:null,...extra});
const shipment=(post_id,quantity,created_at,extra={})=>({post_id,order_no:post_id,lot_id:null,quantity,created_at,cancelled:null,...extra});
const lot=(id,postId,extra={})=>({id,postId,orderNo:postId,flowStatus:'measured',shippedAmount:0,...extra});
const orders=[order('partial'),order('complete'),order('cutoff',100,{shipment_closed_at:'2026-11-12'}),
 order('early',100,{delivery_date:'2026-11-20'}),order('late')];
const shipments=[shipment('partial',50,'2026-11-11T00:00:00Z'),shipment('partial',49,'2026-11-12T00:00:00Z'),
 shipment('partial',1,'2026-11-15T00:00:00Z',{cancelled:true}),shipment('complete',100,'2026-11-10T00:00:00Z')];
const lots=[lot('partial-a','partial'),lot('partial-b','partial'),lot('complete-a','complete'),lot('cutoff-a','cutoff'),lot('early-a','early'),lot('late-a','late')];
const tables={posts:orders,shipments,v_lot_flow_status:lots.map(row=>({id:row.id,post_id:row.postId,order_no:row.orderNo,lot_no:row.id,measured_amount:100,flow_status:'measured',last_shipped_at:'2099-01-01'}))};
function load(file){
 const mocks={react:{...React,useState(initial){const i=state++;if(!(i in values))values[i]=initial;return[values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useEffect(){},useMemo:fn=>fn(),useRef:()=>({current:null})},
 'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
 '@/app/components/AuthProvider/AuthProvider':{useAppAuth:()=>({profile:{manager:false}})},
 '@/lib/supabase':{__esModule:true,default:{from(table){const query={select(){return query;},eq(){return query;},order(){return query;},or(){return query;},range(from,to){requests.push({table,from,to});return Promise.resolve({data:tables[table].slice(from,to+1),error:null});}};return query;}}}};
 const context={exports:{},console,alert:message=>{throw Error(message);},require(name){if(name in mocks)return mocks[name];if(name.endsWith('.css'))return {__esModule:true,default:{}};if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts');return require(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const {enrichLotShipmentList,compareLotShipmentRows}=load('lib/lotShipmentList.ts');
const {formatLotHistoryDate}=load('lib/lotHistoryDate.ts');
check(formatLotHistoryDate('2026-11-12T16:00:00Z'),'2026-11-13');
check(formatLotHistoryDate('2026-11-12'),'2026-11-12');
check(formatLotHistoryDate(''),'-');
check(formatLotHistoryDate('invalid'),'-');
let rows=enrichLotShipmentList(lots,orders,shipments);
const byId=id=>rows.find(row=>row.id===id);
check(byId('partial-a').shipmentState,'partial');
check(byId('partial-b').lastShippedAt,'2026-11-12T00:00:00Z');
check(byId('complete-a').shipmentState,'completed');
check(byId('cutoff-a').shipmentState,'completed');
check(byId('early-a').shipmentState,'unshipped');
check(Array.from(rows.sort(compareLotShipmentRows),row=>row.id),['partial-a','partial-b','complete-a','early-a','cutoff-a','late-a']);
rows=enrichLotShipmentList([lot('legacy','partial')],orders,[shipment(null,100,'2026-11-13T00:00:00Z',{order_no:'partial'})]);
check(rows[0].shipmentState,'completed');
check(rows[0].lastShippedAt,'2026-11-13T00:00:00Z');
rows=enrichLotShipmentList([lot('legacy','partial')],[...orders,order('duplicate',100,{order_no:'partial'})],[shipment(null,100,'2026-11-13T00:00:00Z',{order_no:'partial'})]);
check(rows[0].shipmentState,'unshipped');
check(rows[0].lastShippedAt,'');
rows=enrichLotShipmentList([lot('orphan','missing')],orders,[shipment('missing',20,'2026-11-12T00:00:00Z',{lot_id:'other'})]);
check(rows[0].lastShippedAt,'');
rows=enrichLotShipmentList([lot('cancelled','partial')],orders,[shipment('partial',100,'2026-11-12T00:00:00Z',{cancelled:true})]);
check(rows[0].shipmentState,'unshipped');check(rows[0].lastShippedAt,'');
const Page=load('app/lots/page.tsx').default;
const render=()=>{state=0;return Page();};
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const html=()=>renderToStaticMarkup(render());
await nodes(render()).find(node=>node.type==='button'&&node.props.children==='再読み込み').props.onClick();
check(values[0].length,6);check(html().includes('最終出荷日'),true);check(html().includes('2099-01-01'),false);
check(nodes(render()).find(node=>node.type==='select').props.value,'all');
const filter=value=>nodes(render()).find(node=>node.type==='select').props.onChange({target:{value}});
filter('partial');check(html().includes('partial-a'),true);check(html().includes('partial-b'),true);check(html().includes('complete-a'),false);
filter('completed');check(html().includes('complete-a'),true);check(html().includes('cutoff-a'),true);check(html().includes('partial-a'),false);
filter('unshipped');check(html().includes('early-a'),true);check(html().includes('late-a'),true);check(html().includes('cutoff-a'),false);
filter('all');
const search=nodes(render()).find(node=>node.type==='input');search.props.onChange({target:{value:'partial-a'}});
check(html().includes('partial-a'),true);check(html().includes('partial-b'),false);
search.props.onChange({target:{value:''}});
tables.v_lot_flow_status=Array.from({length:1001},(_,i)=>({id:`row-${i}`,post_id:'early',order_no:'early',lot_no:`LOT-${i}`}));
await nodes(render()).find(node=>node.type==='button'&&node.props.children==='再読み込み').props.onClick();
check(values[0].length,1001);
check(requests.some(row=>row.table==='v_lot_flow_status'&&row.from===1000),true);
check((html().match(/履歴確認/g)||[]).length,30);
nodes(render()).find(node=>node.type==='button'&&node.props.children==='次へ').props.onClick();check(values[4],2);
filter('unshipped');check(values[4],1);check((html().match(/履歴確認/g)||[]).length,30);
console.log(JSON.stringify({mode:'order-level shipment filters, latest registration sorting, cancellation and pagination',passed}));
