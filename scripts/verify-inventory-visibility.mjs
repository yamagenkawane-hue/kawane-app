import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let passed=0;const check=(a,b)=>{assert.deepEqual(a,b);passed++};
function harness(source){
 const states=[[],{productCode:'',productName:'',lotNo:'',currentStock:0,allocatedStock:0},null];let si=0;const effects=[],calls=[],alerts=[];
 const client={from(table){let values;const q={select(){return q},order(){return q},range:async(from,to)=>{calls.push({op:'read',from,to});return {data:source.slice(from,to+1),error:null}},update(v){values=v;return q},eq:async(field,id)=>{calls.push({op:'update',id});Object.assign(source.find(r=>r.id===id),values);return {error:null}},delete(){throw Error('Unexpected physical deletion')}};return q}};
 function load(file){const context={exports:{},alert:s=>alerts.push(s),require(name){
  if(name==='react')return {...React,useEffect:f=>effects.push(f),useState:value=>{const i=si++;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next]}};
  if(name==='@/lib/supabase')return {__esModule:true,default:client};
  if(name==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
  if(name==='@/app/components/Numpad/Numpad')return {__esModule:true,default:()=>null};
  if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');return require(name);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);return context.exports;}
 const Page=load('app/inventoryMaster/page.tsx').default;
 const render=()=>{si=0;return Page()};
 const nodes=t=>!t||typeof t!=='object'?[]:[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
 return {states,calls,alerts,html:()=>renderToStaticMarkup(render()),reload:async()=>{render();effects[0]();await new Promise(setImmediate)},editStock:async value=>nodes(render()).find(n=>n.type==='input'&&n.props.value===12).props.onChange({target:{value}}),save:()=>nodes(render()).find(n=>n.type==='button'&&n.props.children==='保存').props.onClick()};
}
const raw=(id,stock,allocated=0)=>({id,product_code:'P',product_name:'同じ製品',lot_no:`LOT-${id}`,current_stock:stock,allocated_stock:allocated,updated_at:'2026-11-05'});
const source=[raw('ZERO',0),raw('FULL',10,10),raw('VISIBLE',12)];let h=harness(source);await h.reload();check(h.states[0].length,1);check(h.states[0][0].id,'VISIBLE');check(h.html().includes('LOT-ZERO'),false);check(h.html().includes('LOT-FULL'),false);check(h.html().includes('LOT-VISIBLE'),true);check(source.length,3);check(h.calls.every(c=>c.op==='read'),true);
source[0].current_stock=9;await h.reload();check(h.html().includes('LOT-ZERO'),true);
source[0].allocated_stock=9;await h.reload();check(h.html().includes('LOT-ZERO'),false);
source[0].allocated_stock=4;await h.reload();check(h.html().includes('LOT-ZERO'),true);
source[0].current_stock=0;source[0].allocated_stock=0;await h.reload();await h.editStock('0');check(h.html().includes('LOT-VISIBLE'),true);await h.save();check(h.html().includes('LOT-VISIBLE'),false);check(source.length,3);check(source[2].current_stock,0);check(h.calls.filter(c=>c.op==='update').length,1);
const large=Array.from({length:2500},(_,i)=>raw(`ZERO-${i}`,0));large.push(raw('LAST',1));h=harness(large);await h.reload();check(h.states[0].length,1);check(h.states[0][0].id,'LAST');check(h.calls.filter(c=>c.op==='read').length,3);
h=harness([raw('ONE',3),raw('TWO',5)]);await h.reload();check(h.states[0].length,2);check(h.html().includes('LOT-ONE')&&h.html().includes('LOT-TWO'),true);
console.log(JSON.stringify({mode:'inventory availability list, no physical deletion, restored visibility, edits and pagination',passed}));
