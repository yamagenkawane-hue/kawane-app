import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let passed=0,role='worker',sessionActive=true,runnerCalls=0,verifyCalls=0;
const profile={id:'uid',login_id:'worker',manager:false,active:true};
const scopedClient={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:sessionActive?{...profile,manager:role==='manager'}:null,error:null})})})})};
const admin={auth:{getUser:async token=>{verifyCalls++;return token==='valid'?{data:{user:{id:'uid'}},error:null}:{data:{user:null},error:{message:'invalid'}};}}};
function load(file,mocks) {
  const context={exports:{},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public'}},require:name=>{
    if(name in mocks) return mocks[name];
    throw Error('Unexpected import '+name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
  return context.exports;
}
const auth=load('lib/auth/server.ts',{
  '@supabase/supabase-js':{createClient:()=>scopedClient},
  '@/lib/supabaseAdmin':{__esModule:true,default:admin},
});
const response=()=>({statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}});
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
for(const [header,wanted] of [[undefined,401],['Bearer fake',401],['Basic valid',401]]) {
  const res=response();check(await auth.requireApiUser({headers:{authorization:header}},res,true),null);check(res.statusCode,wanted);
}
check(verifyCalls,1);
let res=response();check(await auth.requireApiUser({headers:{authorization:'Bearer valid','x-manager':'true'},body:{is_manager:true}},res,true),null);check(res.statusCode,403);
res=response();check(Boolean(await auth.requireApiUser({headers:{authorization:'Bearer valid'}},res)),true);
role='manager';res=response();check(Boolean(await auth.requireApiUser({headers:{authorization:'Bearer valid'}},res,true)),true);
sessionActive=false;res=response();check(await auth.requireApiUser({headers:{authorization:'Bearer valid'}},res),null);check(res.statusCode,403);
sessionActive=true;
const run=load('pages/api/ai-predictions/run.ts',{
  '@/lib/auth/server':auth,'@/lib/aiPrediction/runner':{runAiPrediction:async()=>{runnerCalls++;return {ok:true};}},
}).default;
res=response();await run({method:'POST',headers:{}},res);check(res.statusCode,401);check(runnerCalls,0);
role='worker';res=response();await run({method:'POST',headers:{authorization:'Bearer valid'}},res);check(res.statusCode,403);check(runnerCalls,0);
role='manager';res=response();await run({method:'POST',headers:{authorization:'Bearer valid'}},res);check(res.statusCode,200);check(runnerCalls,1);
res=response();await run({method:'GET',headers:{authorization:'Bearer valid'}},res);check(res.statusCode,405);check(runnerCalls,1);
const status=load('pages/api/ai-predictions/status.ts',{'@/lib/auth/server':auth,'@/lib/supabaseAdmin':{__esModule:true,default:{from:()=>{throw Error('Unauthorized query executed');}}}}).default;
res=response();await status({method:'GET',headers:{}},res);check(res.statusCode,401);
const shipments=load('pages/api/shipments.ts',{'@/lib/auth/server':auth,'@/lib/supabaseAdmin':{__esModule:true,default:admin,hasSupabaseAdminConfig:true},'@/lib/fetchAllRows':{fetchAllRows:()=>{throw Error('Unauthorized query executed');}}}).default;
role='worker';res=response();await shipments({method:'DELETE',headers:{authorization:'Bearer valid','x-manager':'true'},body:{is_manager:true,cancel_password:'ignored'}},res);check(res.statusCode,403);
for(const file of fs.readdirSync('pages/api',{recursive:true}).filter(f=>f.endsWith('.ts')&&!f.startsWith('auth')&&!f.startsWith('cron'))) {
  check(fs.readFileSync('pages/api/'+file,'utf8').includes('requireApiUser(req,res,'),true);
}
console.log(JSON.stringify({mode:'offline API authorization',passed},null,2));
