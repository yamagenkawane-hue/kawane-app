import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
function load(file,mocks={},globals={}) {
 const context={exports:{},console,...globals,require(name){
  if(name in mocks)return mocks[name];
  if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};
  if(name==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
  if(name==='@/app/components/Numpad/Numpad')return {__esModule:true,default:()=>null};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts',mocks,globals);
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const {buildShippingStockMaps,shippingQuantityError}=load('lib/shippingQuantity.ts');
const maps=buildShippingStockMaps([
 {id:'i1',lot_id:'lot1',current_stock:100,allocated_stock:70},
 {id:'i2',lot_id:'lot1',current_stock:'40',allocated_stock:'10'},
 {id:'i3',lot_id:'lot2',current_stock:20,allocated_stock:30},
], [
 {post_id:'post',inventory_item_id:'i1',allocated_amount:50,shipped_amount:20},
 {post_id:'post',inventory_item_id:'i2',allocated_amount:10,shipped_amount:0},
 {post_id:'other',inventory_item_id:'i1',allocated_amount:40,shipped_amount:0},
 {post_id:'post',inventory_item_id:'i3',allocated_amount:10,shipped_amount:20},
]);
check(maps.freeByLot.get('lot1'),60);
check(maps.ownByOrderLot.get('post:lot1'),40);
check(maps.ownByOrderLot.get('other:lot1'),40);
check(maps.freeByLot.get('lot2'),0);
check(maps.ownByOrderLot.get('post:lot2'),0);
check(shippingQuantityError(50,50,100),'');
check(shippingQuantityError(20,50,100),'');
check(shippingQuantityError(100,50,100).includes('注残は50個'),true);
check(shippingQuantityError(50,100,30).includes('在庫は30個'),true);
check(shippingQuantityError(100,50,30).includes('30個以下'),true);
check(shippingQuantityError(30,50,30),'');
for(const bad of [0,-1,1.5,NaN,Infinity,2147483648])check(Boolean(shippingQuantityError(bad,100,100)),true);
check(shippingQuantityError(999999,999999,999999),'');

const stockRow={post_id:'post',order_no:'SHIP-TEST',lot_id:'lot1',lot_no:'LOT-1',product_code:'P',product_name:'試験製品',customer_name:'試験先',order_amount:100,delivery_date:'2026-12-01',current_stock:100,available_quantity:50};
const sample={lotNo:'LOT-1',lotId:'lot1',rowKey:'post:lot1',id:'post',postId:'post',orderNo:'SHIP-TEST',productCode:'P',productName:'試験製品',customerName:'試験先',orderAmount:100,lotProductionAmount:100,remainingAmount:50,orderRemaining:50,availableStock:100,status:'',deliveryDate:'2026-12-01',completionScheduledDate:'',shippedAmount:50,scheduledDate:'2026-12-01'};
function harness({input,remaining=50,stock=100,conflict=false,confirm=true,fetchError=false}={}){
 const states=[[sample],input===undefined?{}:{'post:lot1':input},'',false,null];
 const refs=[];let si=0,ri=0;const alerts=[],confirmations=[],requests=[];
 const tables={v_shipping_candidates:[{...stockRow,available_quantity:Math.min(remaining,stock),current_stock:stock}],customer_master:[],shipments:[{post_id:'post',order_no:'SHIP-TEST',quantity:100-remaining,cancelled:false}],inventory_items:[{id:'i1',lot_id:'lot1',current_stock:stock,allocated_stock:0}],inventory_allocations:[]};
 const client={from(table){const q={select(){return q},gt(){return q},or(){return q},order(){return q},range(){return Promise.resolve(fetchError?{data:null,error:{message:'offline'}}:{data:tables[table],error:null})}};return q;}};
 const store=new Map();
 const Page=load('app/shipping/page.tsx',{
  react:{...React,useEffect(){},useMemo:f=>f(),useRef(value){const i=ri++;return refs[i]??(refs[i]={current:value})},useState(value){const i=si++;if(!(i in states))states[i]=value;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]}},
  '@/lib/supabase':{__esModule:true,default:client},
  '@/lib/auth/client':{authFetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));if(conflict){tables.shipments[0].quantity=80;tables.v_shipping_candidates[0].available_quantity=20;return {ok:false,status:409,json:async()=>({error:'出荷数が注残数を超えています'})}}return {ok:true}}},
 },{alert:s=>alerts.push(s),window:{confirm:s=>{confirmations.push(s);return confirm}},sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto:{randomUUID:()=> 'test-request'},console:{error(){}}}).default;
 function render(){si=0;ri=0;return Page()}
 function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)]}
 return {render,html:()=>renderToStaticMarkup(render()),ship:async()=>nodes(render()).find(n=>n.type==='button'&&n.props.children==='出荷').props.onClick(),states,alerts,confirmations,requests,refs};
}
let h=harness();let html=h.html();
for(const label of ['出荷済数','注残数','出荷可能在庫','今回の出荷上限：','出荷後の注残：','出荷後のロット在庫：'])check(html.includes(label),true);
check(html.includes('value="50"'),true);
check(html.includes('出荷後の注残：0個'),true);
check(html.includes('出荷後のロット在庫：50個'),true);
await h.ship();check(h.requests.length,1);check(h.requests[0].quantity,50);check(h.confirmations[0].includes('注残：0個'),true);check(h.states[3],false);check(h.refs[0].current,false);
h=harness({input:20});check(h.html().includes('出荷後の注残：30個'),true);await h.ship();check(h.requests[0].quantity,20);
h=harness({input:100});check(h.html().includes('aria-invalid="true"'),true);await h.ship();check(h.requests.length,0);check(h.alerts[0].includes('注残は50個'),true);
h=harness({input:0});await h.ship();check(h.requests.length,0);check(h.alerts[0].includes('1以上'),true);
h=harness({remaining:20});await h.ship();check(h.requests.length,0);check(h.alerts[0].includes('注残は20個'),true);check(h.states[0][0].remainingAmount,20);check(h.states[3],false);
h=harness({remaining:50,stock:30});await h.ship();check(h.requests.length,0);check(h.alerts[0].includes('在庫は30個'),true);
h=harness({remaining:0});await h.ship();check(h.requests.length,0);check(h.alerts[0].includes('0個'),true);
h=harness({conflict:true});await h.ship();check(h.requests.length,1);check(h.alerts.at(-1).includes('最新の注残は20個'),true);check(h.states[0][0].orderRemaining,20);check(h.states[3],false);
h=harness({confirm:false});await h.ship();check(h.requests.length,0);check(h.states[3],false);check(h.refs[0].current,false);
h=harness({fetchError:true});await h.ship();check(h.requests.length,0);check(h.states[0].length,0);check(h.states[3],false);
h=harness();await Promise.all([h.ship(),h.ship()]);check(h.requests.length,1);check(h.refs[0].current,false);
h=harness({remaining:20});await h.ship();check(h.html().includes('value="20"'),true);check(h.html().includes('注残数'),true);
h=harness();h.states[0].push({...sample,lotId:'lot2',lotNo:'LOT-2',rowKey:'post:lot2',lotProductionAmount:30,availableStock:30,remainingAmount:30});html=h.html();check(html.includes('value="50"'),true);check(html.includes('value="30"'),true);check((html.match(/rowSpan="2"/gi)||[]).length>0,true);
const css=fs.readFileSync('app/shipping/page.module.css','utf8');check(css.includes('width: 50%'),true);check(css.includes('min-width: 110px'),true);
console.log(JSON.stringify({mode:'shipping quantities, rendered form, fresh checks and conflict recovery',passed}));

