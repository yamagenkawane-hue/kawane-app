// Real SheetJS parsing and offline UI events; no live DB writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), XLSX=require('xlsx');
let passed=0;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
function load(file,mocks={}){
 const context={exports:{},Date,console:{...console,error(){}},confirm:()=>true,alert(){},require(name){
  if(name in mocks)return mocks[name];
  if(name.endsWith('.css'))return {__esModule:true,default:{}};
  if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts',mocks);
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
for(const format of ['xlsx','xls','csv']){
 const table=[['date','name','type','is_holiday'],['2026-01-02','会社休日','holiday','true'],['2026-01-05','営業日','business_day','false']];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(table),'Calendar');
 const data=XLSX.write(wb,{type:'buffer',bookType:format==='csv'?'csv':format==='xls'?'biff8':'xlsx'});
 const file={name:`calendar.${format}`,type:format==='csv'?'text/csv':'application/vnd.ms-excel',text:async()=>data.toString('utf8'),arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
 const values=[[],'','','2026',file,false,'','','',false],ref={current:false},calls=[];
 let index=0,fail=true;
 const react={...require('react'),useState(initial){const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=v;}];},useRef:()=>ref,useEffect(){}};
 const db={rpc:async(name,args)=>{calls.push({name,args});return{error:fail?{message:'injected failure'}:null};},from(){return{select:async()=>({data:[],error:null})};}};
 const Page=load('app/calendar/page.tsx',{react,'@/lib/supabase':{__esModule:true,default:db}}).default;
 const render=()=>{index=0;return Page();};
 const button=()=>nodes(render()).find(n=>n.type==='button'&&n.props.children==='取り込み');
 await button().props.onClick();
 check(calls.length,1);check(calls[0].name,'replace_company_calendar_year');check(calls[0].args.p_rows.length,2);check(calls[0].args.p_rows[0].date,'2026-01-02');check(calls[0].args.p_rows[1].is_holiday,false);
 check(values[4],file);check(ref.current,false);check(values[5],false);
 fail=false;await button().props.onClick();check(calls.length,2);check(values[4],null);
}
const {validateCalendarYearRows}=load('lib/calendarImport.ts');
const row={date:'2026-01-01',name:'休日',is_holiday:true,type:'holiday'};
for(const input of [[],[row,row],[{...row,date:'2026-02-30'}],[{...row,date:'2027-01-01'}],[{...row,is_holiday:'true'}]]){assert.throws(()=>validateCalendarYearRows(2026,input));passed++;}
console.log(JSON.stringify({mode:'real XLSX/XLS/CSV parsing, atomic RPC and retry UI',passed}));
