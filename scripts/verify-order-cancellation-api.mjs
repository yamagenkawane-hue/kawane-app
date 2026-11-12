// Offline password verification; all credentials and responses are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let passed=0,role='manager',allowed=true,passwordError=null,dbError=null,signoutError=null,verifiedId=uid(1),active=true;
const calls=[],cleanup=[],identity=[];
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const client={from:()=>{const q={select:()=>q,order:()=>q,range:()=>q,then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return q;}};
const admin={from:()=>({select:()=>({eq:(key,id)=>{identity.push({key,id});return{maybeSingle:async()=>({data:{id:uid(1),auth_email:'current@example.invalid',active,manager:role==='manager'},error:null})};}})}),rpc:async(name,args)=>{calls.push({name,args});return name==='consume_login_attempt'?{data:allowed,error:null}:{error:dbError};}};
const mocks={'@/lib/auth/server':{requireApiUser:async(req,res)=>{if(role!=='manager'){res.status(role==='anonymous'?401:403).json({error:'denied'});return null;}return{client,user:{id:uid(1)}};},newAuthClient:()=>({auth:{signInWithPassword:async(args)=>{identity.push(args);return{data:{user:{id:verifiedId},session:passwordError?null:{}},error:passwordError};},signOut:async args=>{cleanup.push(args);return{error:signoutError};}}})},'@/lib/supabaseAdmin':{__esModule:true,default:admin}};
function load(file){const context={exports:{},Buffer,require(name){if(name in mocks)return mocks[name];if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts');return require(name);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return context.exports;}
const handler=load('pages/api/order-cancellations.ts').default;
const body={post_ids:[uid(2)],request_id:uid(3),password:'synthetic-password',actor_id:uid(99),auth_email:'other@example.invalid'};
async function request(payload=body,method='POST'){const res={code:200,status(n){this.code=n;return this;},json(b){this.body=b;return this;},end(){return this;},setHeader(){}};await handler({method,body:payload,headers:{authorization:'Bearer x.'+Buffer.from(JSON.stringify({session_id:uid(4)})).toString('base64url')+'.x'}},res);return res;}
for(const r of ['anonymous','worker']){role=r;const before=calls.length;check((await request()).code,r==='anonymous'?401:403);check(calls.length,before);}role='manager';
for(const invalid of [{},{...body,password:''},{...body,post_ids:[]},{...body,post_ids:[uid(2),uid(2)]},{...body,post_ids:['invalid']},{...body,request_id:'invalid'}]){const before=calls.length;check((await request(invalid)).code,400);check(calls.length,before);}
allowed=false;check((await request()).code,429);check(cleanup.length,0);allowed=true;
for(const [status,wanted]of [[400,403],[401,403],[422,403],[429,429],[500,503]]){passwordError={status};const before=calls.filter(c=>c.name==='cancel_mistaken_orders').length;check((await request()).code,wanted);check(calls.filter(c=>c.name==='cancel_mistaken_orders').length,before);}passwordError=null;
verifiedId=uid(99);check((await request()).code,503);verifiedId=uid(1);
signoutError={message:'cleanup failed'};check((await request()).code,503);signoutError=null;
active=false;check((await request()).code,403);active=true;
check((await request()).code,200);
const deletion=calls.filter(c=>c.name==='cancel_mistaken_orders');check(deletion.length,1);check(deletion[0].args.p_actor_id,uid(1));check(deletion[0].args.p_session_id,uid(4));check(JSON.stringify(deletion[0].args).includes('password'),false);
check(identity.filter(x=>x.email).every(x=>x.email==='current@example.invalid'),true);check(identity.filter(x=>x.key).every(x=>x.key==='id'&&x.id===uid(1)),true);
check(cleanup.every(x=>x.scope==='local'),true);
dbError={code:'P0001'};check((await request()).code,409);dbError=null;
check((await request({},'GET')).code,200);check((await request({},'PUT')).code,405);
console.log(JSON.stringify({mode:'manager password, impersonation prevention, rate limit, session cleanup and atomic RPC API',passed}));
