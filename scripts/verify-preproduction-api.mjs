// Offline handlers with a PostgREST-sized fixture; no network or external messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let passed=0, writes=0, rows={}, databaseError=null, authStatus=200;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const db={from(table){
  let from=0,to=999;
  const q={select(){return q;},order(){return q;},eq(){return q;},is(){return q;},or(){return q;},lte(){return q;},
    range(a,b){from=a;to=b;return q;},insert(){writes++;return q;},update(){writes++;return q;},delete(){writes++;return q;},
    single:async()=>({data:{id:'ok'},error:databaseError}),
    then(resolve,reject){return Promise.resolve({data:(rows[table]||[]).slice(from,Math.min(to,from+999)+1),error:databaseError}).then(resolve,reject);}};
  return q;
}};
const auth={requireApiUser:async(req,res)=>{if(authStatus!==200){res.status(authStatus).json({error:'synthetic auth'});return null;}return{client:db};}};
function load(file,mocks={}){
 const context={exports:{},process:{env:{}},console,require(name){
  if(name in mocks)return mocks[name];
  if(name==='@/lib/auth/server')return auth;
  if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts',mocks);
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const response=()=>({statusCode:200,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},end(){return this;}});
async function request(handler,body={},method='POST',query={}){const res=response();await handler({method,body,query,headers:{}},res);return res;}
const handlers=Object.fromEntries(['results','lots','processes','production-schedules','daily-production'].map(name=>[name,load(`pages/api/${name}.ts`).default]));
const id='00000000-0000-0000-0000-000000000001';
for(const [name,handler] of Object.entries(handlers)) {
 for(const body of [{},null,[],{amount:1},{id},{plan_amount:-1}]){const before=writes;check((await request(handler,body)).statusCode,400);check(writes,before);}
 if(name!=='daily-production')for(const body of [{},{id},{id:'bad',amount:1}])check((await request(handler,body,'PUT')).statusCode,400);
}
const valid={results:{post_id:id,order_process_id:id,date:'2026-10-20',amount:1,process_name:'製造'},lots:{lot_no:'LOT',product_name:'P',customer_name:'C',quantity:1},processes:{process_id:'P',name:'製造'},'production-schedules':{customer_name:'C',product_name:'P',press_number:'1',plan_amount:1}};
for(const [name,body]of Object.entries(valid)){
 check((await request(handlers[name],body)).statusCode,201);
 for(const [code,status]of [['23503',409],['42501',403],['22007',400],['XX000',500]]){databaseError={code};check((await request(handlers[name],body)).statusCode,status);}databaseError=null;
}
const shipping=load('pages/api/shipments/shipping-date.ts').default;
for(const date of ['2026-02-30','2026-13-01','2026-1-01','0000-01-01',5,{},null])check((await request(shipping,{delivery_date:date})).statusCode,400);
for(const offset of [-1,0.5,'2',null,Infinity,NaN,3651])check((await request(shipping,{delivery_date:'2026-10-20',shipping_offset_days:offset})).statusCode,400);
check((await request(shipping,{delivery_date:'2028-03-01',shipping_offset_days:1})).body.shipping_date,'2028-02-29');
check((await request(shipping,{delivery_date:'2026-01-01',shipping_offset_days:0})).statusCode,200);
for(const count of [999,1000,1001,1500,5000]){
 const items=Array.from({length:count},(_,i)=>({id:String(i),order_no:`N${i}`,post_id:String(i),order_amount:100,quantity:1,process_order:1,completed_amount:0,planned_start_date:'2026-10-20'}));
 rows={v_posts_with_master:items,v_production_results_with_master:items,v_production_schedules_with_master:items,shipments:items,v_order_processes_with_master:items};
 for(const name of ['results','daily-production','production-schedules']){
  const res=await request(handlers[name],{},'GET',{date:'2026-10-20'});check(res.statusCode,200);check(res.body.length,count);check(new Set(res.body.map(r=>r.id)).size,count);
 }
 // Related records after the first 1,000 also affect outstanding-order filtering.
 rows.shipments=[...items,{post_id:String(count-1),quantity:99}];
 check((await request(handlers['daily-production'],{},'GET',{date:'2026-10-20'})).body.length,count-1);
 check((await request(handlers['production-schedules'],{},'GET')).body.length,count-1);
 rows.shipments=items;rows.v_order_processes_with_master=[...items,{post_id:String(count-1),process_order:2,completed_amount:100}];
 check((await request(handlers['daily-production'],{},'GET',{date:'2026-10-20'})).body.length,count-1);
 check((await request(handlers['production-schedules'],{},'GET')).body.length,count-1);
}
let failure=null;
const realAuth=load('lib/auth/server.ts',{'@supabase/supabase-js':{createClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{active:true,manager:true},error:null})})})})})},'@/lib/supabaseAdmin':{__esModule:true,default:{auth:{getUser:async()=>({data:{user:{id}},error:failure})}}}});
for(const [status,wanted]of [[400,401],[401,401],[403,401],[429,503],[500,503],[undefined,503]]){failure={status};const res=response();await realAuth.requireApiUser({headers:{authorization:'Bearer synthetic'}},res);check(res.statusCode,wanted);}
failure=null;const recovered=response();check(Boolean(await realAuth.requireApiUser({headers:{authorization:'Bearer synthetic'}},recovered)),true);
let constructed=0,sent=0;
const line=load('pages/api/linebot.ts',{'@line/bot-sdk':{messagingApi:{MessagingApiClient:class {constructor(){constructed++;}async pushMessage(){sent++;}}}}}).default;
authStatus=401;check((await request(line)).statusCode,401);check(constructed,0);
authStatus=403;check((await request(line)).statusCode,403);check(constructed,0);
authStatus=200;check((await request(line,{message:'test',userId:'fake'})).statusCode,503);check(constructed,0);check(sent,0);
check(writes>0,true);
console.log(JSON.stringify({mode:'offline API input, auth outages, paging boundaries and unconfigured LINE',passed}));

