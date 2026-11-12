// Offline event tests; no browser credentials, live Auth or business writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url);
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
function harness(file,initial){
 const values=[...initial],refs=[],calls=[];let index=0,ri=0,failed=true,successes=0;
 const context={exports:{},crypto:{randomUUID:()=> 'request-key'},console,require(name){
  if(name==='react')return{...React,useState(initial){const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(v){const i=ri++;return refs[i]??(refs[i]={current:v});},useEffect(){}};
  if(name.endsWith('.css'))return{__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};
  if(name==='@/lib/auth/client')return{authFetch:async(url,args)=>{calls.push({url,...args,body:JSON.parse(args.body)});return{ok:!failed,json:async()=>failed?{error:'パスワードが違います'}:{ok:true}};}};
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return{values,calls,setFailed:v=>{failed=v;},successes:()=>successes,render(){index=0;ri=0;return file.includes('useOrderCancellation')?context.exports.useOrderCancellation(()=>{successes++;}):context.exports.default();}};
}
function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
const h=harness('app/components/OrderCancellation/useOrderCancellation.tsx',[null,'',false,'']);
let result=h.render();check(result.cancellationDialog,null);
result.openCancellation([{id:'post',label:'T26-TEST'}]);result=h.render();
check(nodes(result.cancellationDialog).find(n=>n.type==='input').props.type,'password');
check(nodes(result.cancellationDialog).find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
nodes(result.cancellationDialog).find(n=>n.type==='input').props.onChange({target:{value:'synthetic-password'}});result=h.render();
await nodes(result.cancellationDialog).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
result=h.render();check(h.calls.length,1);check(h.values[1],'');check(h.successes(),0);
check(renderToStaticMarkup(result.cancellationDialog).includes('パスワードが違います'),true);
const key=h.calls[0].body.request_id;
nodes(result.cancellationDialog).find(n=>n.type==='input').props.onChange({target:{value:'synthetic-password'}});result=h.render();h.setFailed(false);
const form=nodes(result.cancellationDialog).find(n=>n.type==='form');
await Promise.all([form.props.onSubmit({preventDefault(){}}),form.props.onSubmit({preventDefault(){}})]);
check(h.calls.length,2);check(h.calls[1].body.request_id,key);check(h.calls[1].body.post_ids[0],'post');check(h.successes(),1);check(h.values[1],'');check(h.render().cancellationDialog,null);
result=h.render();result.openCancellation([{id:'other',label:'OTHER'}]);result=h.render();
nodes(result.cancellationDialog).find(n=>n.type==='button'&&n.props.children==='キャンセル').props.onClick();
check(h.calls.length,2);check(h.render().cancellationDialog,null);
const rows=Array.from({length:35},(_,i)=>({id:String(i),order_no:`ORDER-${i}`,customer_name:'得意先',product_name:'製品',order_amount:100,cancelled_at:'2026-11-12T09:00:00Z',actor_name:'管理者'}));
const history=harness('app/orders/history/page.tsx',[rows,false,'','',1]);
let tree=history.render(),html=renderToStaticMarkup(tree);
check(html.includes('誤登録取消履歴'),true);check(html.includes('操作者'),true);check(html.includes('ORDER-29'),true);check(html.includes('ORDER-30'),false);
nodes(tree).find(n=>n.type==='button'&&n.props.children==='次へ').props.onClick();html=renderToStaticMarkup(history.render());check(html.includes('ORDER-30'),true);check(html.includes('ORDER-29'),false);
nodes(history.render()).find(n=>n.type==='input').props.onChange({target:{value:'ORDER-34'}});html=renderToStaticMarkup(history.render());check(html.includes('ORDER-34'),true);check(html.includes('1 / 1'),true);
console.log(JSON.stringify({mode:'masked password dialog, no-password prevention, retry key, double-click guard and 30-row history',passed}));
