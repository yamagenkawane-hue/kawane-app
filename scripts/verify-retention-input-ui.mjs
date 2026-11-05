import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let passed=0;const check=(a,b)=>{assert.deepEqual(a,b);passed++};
const view={settings:{detail_years:3,ai_years:5,prediction_days:90},preview:{rows:[],total:0},events:[],reference_days:730};
const states=[null,view,{...view.settings},0,'',false,null,'','',false];let si=0,ri=0;const refs=[],calls=[];
function load(file){const context={exports:{},require(name){
 if(name==='react')return {...React,useEffect(){},useCallback:f=>f,useRef:v=>{const i=ri++;return refs[i]??(refs[i]={current:v})},useState:v=>{const i=si++;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next]}};
 if(name==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
 if(name==='@/app/components/Numpad/Numpad')return {__esModule:true,default:()=>null};
 if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};
 if(name==='@/lib/auth/client')return {authFetch:async(url,opts)=>{calls.push({url,...opts});if(opts?.method==='PUT')view.settings=JSON.parse(opts.body);return {ok:true,json:async()=>view}}};
 if(name.startsWith('@/'))return load(name.slice(2)+'.ts');return require(name);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);return context.exports;}
const Page=load('app/historyRetention/page.tsx').default;
const render=()=>{si=0;ri=0;return Page()};
const nodes=t=>!t||typeof t!=='object'?[]:[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
const fields=()=>nodes(render()).filter(n=>n.type==='input'&&n.props.type==='number');
const pad=()=>nodes(render()).find(n=>n.props?.replaceOnFirstInput);
check(fields().length,3);
for(const [index,key,start,next] of [[0,'detail_years',3,'2'],[1,'ai_years',5,'6'],[2,'prediction_days',90,'365']]){
 fields()[index].props.onFocus();check(pad().props.value,String(start));check(pad().props.open,true);check(pad().props.replaceOnFirstInput,true);
 pad().props.onChange(next);check(states[2][key],Number(next));pad().props.onClose();check(pad(),undefined);
 fields()[index].props.onClick();check(pad().props.value,next);pad().props.onClose();
}
check(states[2].detail_years,2);check(states[2].ai_years,6);check(states[2].prediction_days,365);check(calls.length,0);
fields()[2].props.onClick();pad().props.onChange('1.5');check(states[2].prediction_days,365);pad().props.onChange('');check(states[2].prediction_days,0);pad().props.onChange('120');pad().props.onClose();
check(fields()[0].props.min,1);check(fields()[0].props.max,30);check(fields()[1].props.min,2);check(fields()[2].props.min,30);check(fields()[2].props.max,3650);
states[5]=true;check(fields().every(n=>n.props.disabled),true);states[5]=false;
const form=nodes(render()).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});await new Promise(setImmediate);
check(calls.filter(c=>c.method==='PUT').length,1);const saved=JSON.parse(calls.find(c=>c.method==='PUT').body);check(saved.prediction_days,120);check(saved.detail_years,2);check(saved.ai_years,6);
const file=nodes(render()).find(n=>n.type==='input'&&n.props.type==='file');check(file.props.className,'fileInput');check(file.props.accept,'.json,application/json');check(file.props.disabled,false);
const css=fs.readFileSync('app/historyRetention/page.module.css','utf8');check(css.includes('.fileInput { cursor:pointer'),true);check(css.includes('.fileInput:hover:not(:disabled)'),true);check(css.includes('.fileInput:focus-visible'),true);check(css.includes('.fileInput:disabled { cursor:not-allowed'),true);
check(renderToStaticMarkup(render()).includes('履歴管理マスタ'),true);
console.log(JSON.stringify({mode:'retention keypad fields, explicit save, numeric limits and file-picker styles',passed}));
