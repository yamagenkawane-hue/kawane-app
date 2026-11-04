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
const sample={lotNo:'LOT-1',lotId:'lot1',rowKey:'post:lot1',id:'post',postId:'post',orderNo:'SHIP-TEST',productCode:'P',productName:'試験製品',customerName:'試験先',orderAmount:100,lotProductionAmount:100,remainingAmount:50,status:'',deliveryDate:'2026-12-01',completionScheduledDate:'',shippedAmount:0,scheduledDate:'2026-12-01'};
function harness({limit=50,input,confirm=true}={}){
 const states=[[{...sample,remainingAmount:limit}],input===undefined?{}:{'post:lot1':input},'',false,null];
 const refs=[],alerts=[],requests=[],effects=[];let si=0,ri=0;
 const rows=[{post_id:'post',order_no:'SHIP-TEST',lot_id:'lot1',lot_no:'LOT-1',product_code:'P',product_name:'試験製品',customer_name:'試験先',order_amount:100,delivery_date:'2026-12-01',current_stock:100,available_quantity:limit}];
 const tables={v_shipping_candidates:rows,customer_master:[]};
 const client={from(table){const q={select(){return q},gt(){return q},order(){return q},range(){return Promise.resolve({data:tables[table],error:null})}};return q;}};
 const store=new Map();
 function load(file){
  const context={exports:{},console,alert:s=>alerts.push(s),window:{confirm:()=>confirm},sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto:{randomUUID:()=> 'test-request'},require(name){
   if(name==='react')return {...React,useEffect:f=>effects.push(f),useMemo:f=>f(),useRef(value){const i=ri++;return refs[i]??(refs[i]={current:value})},useState(value){const i=si++;if(!(i in states))states[i]=value;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]}};
   if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};
   if(name==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
   if(name==='@/app/components/Numpad/Numpad')return {__esModule:true,default:()=>null};
   if(name==='@/lib/supabase')return {__esModule:true,default:client};
   if(name==='@/lib/auth/client')return {authFetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));rows[0].available_quantity=30;return {ok:true}}};
   if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
   return require(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
  return context.exports;
 }
 const Page=load('app/shipping/page.tsx').default;
 const render=()=>{si=0;ri=0;return Page()};
 const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
 return {states,alerts,requests,html:()=>renderToStaticMarkup(render()),ship:()=>nodes(render()).find(n=>n.type==='button'&&n.props.children==='出荷').props.onClick(),numpad:()=>nodes(render()).at(-1).props};
}
let h=harness();let html=h.html();
check(html.includes('value="50"'),true);
for(const text of ['出荷済数','注残数','出荷可能在庫','今回の出荷上限','出荷後の注残'])check(html.includes(text),false);
check(html.includes('<th>出荷数</th>'),true);
await h.ship();check(h.requests[0].quantity,50);check(h.html().includes('value="30"'),true);check(h.states[3],false);
h=harness({limit:30});check(h.html().includes('value="30"'),true);await h.ship();check(h.requests[0].quantity,30);
h=harness({input:20});check(h.html().includes('value="20"'),true);await h.ship();check(h.requests[0].quantity,20);
for(const bad of [0,51,1.5,-1]){h=harness({input:bad});await h.ship();check(h.requests.length,0);check(h.alerts.length,1);}
h=harness({input:0});check(h.html().includes('value=""'),true);check(h.html().includes('value="50"'),false);
h=harness({limit:999999});check(h.html().includes('value="999999"'),true);
h=harness();h.states[4]='post:lot1';check(h.numpad().value,'50');check(h.numpad().replaceOnFirstInput,true);
h=harness({input:20});h.states[4]='post:lot1';check(h.numpad().value,'20');
h=harness({confirm:false});await h.ship();check(h.requests.length,0);
h=harness();h.states[0].push({...sample,lotId:'lot2',lotNo:'LOT-2',rowKey:'post:lot2',remainingAmount:30});html=h.html();check(html.includes('value="50"'),true);check(html.includes('value="30"'),true);
const css=fs.readFileSync('app/shipping/page.module.css','utf8');check(css.includes('width: 50%'),true);check(css.includes('min-width: 110px'),true);
console.log(JSON.stringify({mode:'original shipping UI with stock-capped defaults and narrow input',passed}));
