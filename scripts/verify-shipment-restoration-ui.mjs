import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let passed=0;const check=(a,b)=>{assert.deepEqual(a,b);passed++};
const sample={id:'closure',order_no:'T26-009',customer_name:'試験先',product_name:'試験製品',order_amount:50,shipped_amount:0,closed_quantity:50,reason:'理由入力なし',actor_name:'operator',closed_at:'2026-11-04T10:00:00Z',restored_at:null,restored_actor_name:null};
function harness({confirm=true,error=false,restored=false,many=false}={}) {
 const rows=many?Array.from({length:35},(_,i)=>({...sample,id:`c${i}`,order_no:`TEST-${i}`})):[{...sample,...(restored?{restored_at:'2026-11-04T11:00:00Z',restored_actor_name:'operator'}:{})}];
 const states=[null,'',rows,'',1,false,''];const refs=[];let si=0,ri=0;const calls=[],confirmations=[];const storage=new Map();
 const context={exports:{},window:{confirm:s=>{confirmations.push(s);return confirm}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'request'},require(name){
  if(name==='react')return {...React,useEffect(){},useRef:v=>{const i=ri++;return refs[i]??(refs[i]={current:v})},useState:v=>{const i=si++;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next]}};
  if(name==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
  if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};
  if(name==='@/lib/auth/client')return {authFetch:async(url,opts)=>{calls.push({url,method:opts.method,body:JSON.parse(opts.body)});return {ok:!error,json:async()=>error?{error:'復元済みです'}:{...sample,restored_at:'2026-11-04T11:00:00Z',restored_actor_name:'operator',restored_shipment_quantity:30}}}};
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/shipping/history/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 const render=()=>{si=0;ri=0;return context.exports.default()};
 const nodes=t=>!t||typeof t!=='object'?[]:[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
 return {states,calls,confirmations,html:()=>renderToStaticMarkup(render()),click:label=>nodes(render()).find(n=>n.type==='button'&&n.props.children===label)?.props.onClick()};
}
let h=harness();let html=h.html();check(html.includes('0個で打ち切り'),true);check(html.includes('復元日時'),true);check((html.match(/>復元<\/button>/g)||[]).length,1);
await h.click('復元');check(h.calls.length,1);check(h.calls[0].method,'PATCH');check(h.calls[0].body.closure_id,'closure');check(h.html().includes('復元済み'),true);check(h.html().includes('注残に戻し'),true);check(h.html().includes('出荷した30個を在庫に戻しました'),true);check(h.html().includes('在庫復元数'),true);check(h.states[0],null);check(h.confirmations[0].includes('それ以前の通常出荷は取り消しません'),true);
h=harness({confirm:false});await h.click('復元');check(h.calls.length,0);
h=harness({error:true});await h.click('復元');check(h.html().includes('復元済みです'),true);check(h.html().includes('>復元</button>'),true);check(h.states[0],null);
h=harness();await Promise.all([h.click('復元'),h.click('復元')]);check(h.calls.length,1);
h=harness({restored:true});check(h.html().includes('>復元</button>'),false);
h=harness({many:true});html=h.html();check((html.match(/>復元<\/button>/g)||[]).length,30);await h.click('次へ');check((h.html().match(/>復元<\/button>/g)||[]).length,5);
console.log(JSON.stringify({mode:'restore history UI, confirmation, retry guard and pagination',passed}));
