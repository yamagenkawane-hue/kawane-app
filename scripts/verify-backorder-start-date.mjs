// Offline API/React integration. No real orders are edited.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let passed=0,values=[],state=0,effects=[],alerts=[],writes=[],filters=[];
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const today='2026-11-13';
class FixedDate extends Date { constructor(...args){super(...(args.length?args:['2026-11-13T03:00:00Z']));} }
const raw=(id,start)=>({id,order_no:`ORDER-${id}`,planned_start_date:start,order_amount:100,product_name:'製品',customer_name:'得意先',delivery_date:'2026-12-20',completion_scheduled_date:'2026-12-18',delete:false});
const rows=[raw('past','2026-11-12'),raw('today',today),raw('future','2026-11-14'),raw('empty',''),raw('null',null),raw('invalid','2026-02-30'),raw('complete',today),raw('finished',today)];
let tables={v_posts_with_master:rows,shipments:[{post_id:'complete',quantity:100,cancelled:null}],v_order_processes_with_master:[{post_id:'finished',process_order:1,completed_amount:100}]};
// Actual editable columns checked against information_schema on 2026-11-13.
// remaining_amount belongs to the display view, not the posts table.
const editableColumns=new Set(['order_no','product_name','customer_name','order_amount','planned_start_date','completion_scheduled_date','delivery_date','remark','updated_at']);
const db={from(table){let op='read',payload,id,from=0,to=999;const query={select(){return query;},order(){return query;},not(){return query;},gt(){return query;},is(){return query;},or(value){filters.push(value);return query;},lte(key,value){filters.push([key,value]);return query;},eq(key,value){if(key==='id')id=value;return query;},range(a,b){from=a;to=b;return query;},update(value){op='update';payload=value;return query;},then(resolve,reject){
 if(op==='update'){
  const unknown=Object.keys(payload).find(key=>!editableColumns.has(key));
  if(table==='posts'&&unknown)return Promise.resolve({data:null,error:{message:`Could not find the '${unknown}' column of 'posts' in the schema cache`,code:'PGRST204'}}).then(resolve,reject);
  writes.push({table,payload,id});Object.assign(rows.find(row=>row.id===id)||{},payload);
 }
 return Promise.resolve({data:(tables[table]||[]).slice(from,to+1),error:null}).then(resolve,reject);
}};return query;}};
const hooks={...React,useState(initial){const i=state++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useEffect(fn){effects.push(fn);},useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value})};
const apiCalls=[];
function load(file){
 const context={exports:{},Date:FixedDate,console,alert:message=>alerts.push(message),require(name){
  if(name==='react')return hooks;
  if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
  if(name.endsWith('.css'))return {__esModule:true,default:{}};
  if(name==='@/lib/supabase'||name==='../../lib/supabase')return {__esModule:true,default:db};
  if(name==='@/app/components/AuthProvider/AuthProvider')return {useAppAuth:()=>({profile:{manager:true}})};
  if(name==='@/app/components/OrderCancellation/useOrderCancellation')return {useOrderCancellation:()=>({cancellationDialog:null,requestCancellation:()=>{}})};
  if(name==='@/app/components/Numpad/Numpad')return {__esModule:true,default:()=>null};
  if(name==='@/lib/auth/server')return {requireApiUser:async()=>({client:db})};
  if(name==='@/lib/auth/client')return {authFetch:async url=>{apiCalls.push(url);return {ok:true,json:async()=>rows};}};
  if(name.startsWith('@/lib/')||name.startsWith('@/app/utills/'))return load(name.slice(2)+'.ts');
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const {hasProductionStarted}=load('lib/dailyProductionStart.ts');
const rejected=await db.from('posts').update({remaining_amount:50}).eq('id','past');
check(rejected.error.code,'PGRST204');check(writes.length,0);
for(const [start,expected]of [['2026-11-12',true],[today,true],['2026-11-14',false],['',false],[null,false],[undefined,false],['2026-02-30',false]])check(hasProductionStarted(start,today),expected);
const handler=load('pages/api/daily-production.ts').default;
const res=()=>({statusCode:200,body:null,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},setHeader(){},end(){return this;}});
let response=res();await handler({method:'GET',query:{date:today}},response);
check(response.statusCode,200);check(Array.from(response.body,row=>row.id).join(','),'past,today');
check(filters.some(value=>Array.isArray(value)&&value[0]==='planned_start_date'&&value[1]===today),true);
check(filters.some(value=>typeof value==='string'&&value.includes('shipping_scheduled_start')),false);
response=res();await handler({method:'GET',query:{date:'2026-11-14'}},response);check(response.body.some(row=>row.id==='future'),true);
response=res();await handler({method:'GET',query:{date:'2026-02-30'}},response);check(response.statusCode,400);
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const mount=(Page,initial=[])=>{values=initial;effects=[];return ()=>{state=0;return Page();};};
const post={id:'past',orderNo:'ORDER-past',productName:'製品',customerName:'得意先',orderAmount:100,remainingAmount:100,status:'未着手',deliveryDate:'2026-12-20',completionScheduledDate:'2026-12-18',plannedStartDate:'2026-11-12',manufacturingLots:[]};
const Orders=load('app/orders/page.tsx').default;
let render=mount(Orders,[[post]]);
let tree=render(),html=renderToStaticMarkup(tree);
check(html.includes('<th>状態</th><th>開始予定</th>'),true);check(html.includes('2026-11-12'),true);
nodes(tree).find(node=>node.type==='button'&&node.props.children==='編集').props.onClick();
const startInput=()=>nodes(render()).find(node=>node.type==='input'&&node.props['aria-label']==='開始予定');
check(startInput().props.value,'2026-11-12');startInput().props.onChange({target:{value:'2026-11-14'}});
await nodes(render()).find(node=>node.type==='button'&&node.props.children==='保存').props.onClick();
check(writes.length,1);check(writes[0].payload.planned_start_date,'2026-11-14');check(writes[0].id,'past');
check('remaining_amount' in writes[0].payload,false);
check(values[0].find(row=>row.id==='past').plannedStartDate,'2026-11-14');
// Invalid relative dates never reach the update operation; clearing writes NULL.
render=mount(Orders,[[post],'','delivery','past',{...post,plannedStartDate:'2027-01-01'}]);
await nodes(render()).find(node=>node.type==='button'&&node.props.children==='保存').props.onClick();check(writes.length,1);check(alerts.at(-1).includes('開始予定日'),true);
startInput().props.onChange({target:{value:''}});await nodes(render()).find(node=>node.type==='button'&&node.props.children==='保存').props.onClick();check(writes.at(-1).payload.planned_start_date,null);
// Department balances and old schedules must not bring future/missing-start orders back.
rows[0].planned_start_date='2026-11-12';
tables={...tables,v_production_schedules_with_master:rows.map(row=>({id:`s-${row.id}`,post_id:row.id,order_no:row.order_no,planned_start_date:'2000-01-01',department:'製造G',press_number:'1号機'})),
 v_lot_process_balance_with_master:rows.slice(0,4).flatMap(row=>['検査','梱包'].map(name=>({id:`${row.id}-${name}`,post_id:row.id,order_no:row.order_no,process_name:name,quantity:10}))),
 v_process_transfer_history_with_master:rows.slice(0,4).map(row=>({id:`completed-${row.id}`,post_id:row.id,order_no:row.order_no,from_process_name:'梱包',quantity:10,created_at:'2026-11-12T00:00:00Z'}))};
const Daily=load('app/productionSchedules/page.tsx').default;
render=mount(Daily);render();effects[0]();await new Promise(resolve=>setTimeout(resolve,0));
check(apiCalls.at(-1),`/api/daily-production?date=${today}`);
for(const department of ['全て','製造G','品質管理G','梱包出荷G']){
 values[3]=department;html=renderToStaticMarkup(render());
 check(html.includes('ORDER-past'),true);check(html.includes('ORDER-today'),true);
 check(html.includes('ORDER-future'),false);check(html.includes('ORDER-empty'),false);check(html.includes('ORDER-null'),false);
 check(html.includes('2000-01-01'),false);
}
check(alerts.length,1);
console.log(JSON.stringify({mode:'backorder start-date editing, reached-date API and all department visibility',passed}));
