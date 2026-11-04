import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';
let passed=0,authorized=true,rpcError=null;
const calls=[];
function load(file,mocks={}){const c={exports:{},require:n=>{if(n in mocks)return mocks[n];throw Error(n);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);return c.exports;}
const auth={requireApiUser:async(req,res)=>{if(!authorized){res.status(401).json({error:'login'});return null;}return {profile:{manager:false},client:{rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'audit'},error:rpcError}},from:()=>({select(){return this},order(){return this},range:async()=>({data:[{id:'audit',closed_quantity:50}],error:null})})}}}};
const handler=load('pages/api/shipment-closures.ts',{'@/lib/auth/server':auth,'@/lib/fetchAllRows':load('lib/fetchAllRows.ts')}).default;
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const body={post_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',reason:' 在庫不足 '};
async function req(method,values=body){const res={statusCode:200,body:null,headers:{},status(c){this.statusCode=c;return this},json(v){this.body=v;return this},setHeader(k,v){this.headers[k]=v},end(){return this}};await handler({method,body:values},res);return res;}
authorized=false;check((await req('POST')).statusCode,401);check(calls.length,0);authorized=true;
check((await req('POST')).statusCode,201);check(calls.at(-1).name,'ship_stock_and_close_order');check(calls.at(-1).args.p_reason,'在庫不足');check(Object.keys(calls.at(-1).args).sort().join(','),'p_post_id,p_reason,p_request_id,p_scheduled_date');
for(const fields of [{post_id:'bad'},{request_id:'bad'},{reason:'x'.repeat(501)},{reason:5}])check((await req('POST',{...body,...fields})).statusCode,400);
for(const reason of [undefined,null,'',' ']){check((await req('POST',{...body,reason})).statusCode,201);check(calls.at(-1).args.p_reason,'理由入力なし');}
rpcError={code:'P0001',message:'already closed'};check((await req('POST')).statusCode,409);rpcError={code:'42501',message:'forbidden'};check((await req('POST')).statusCode,403);rpcError=null;
const get=await req('GET');check(get.statusCode,200);check(get.body[0].closed_quantity,50);check((await req('DELETE')).statusCode,405);
authorized=false;check((await req('PATCH',{})).statusCode,401);authorized=true;
for(const values of [{},{closure_id:'bad',request_id:body.request_id},{closure_id:body.post_id,request_id:'bad'}])check((await req('PATCH',values)).statusCode,400);
check((await req('PATCH',{closure_id:body.post_id,request_id:body.request_id})).statusCode,200);check(calls.at(-1).name,'restore_order_shipments');check(calls.at(-1).args.p_closure_id,body.post_id);
rpcError={code:'P0001',message:'already restored'};check((await req('PATCH',{closure_id:body.post_id,request_id:body.request_id})).statusCode,409);rpcError=null;
const {outstandingOrderIds}=load('lib/orderVisibility.ts');
const ids=outstandingOrderIds([{id:'closed',order_no:'A',order_amount:100,shipment_closed_at:'2026-11-04'},{id:'open',order_no:'B',order_amount:100},{id:'full',order_no:'C',order_amount:100}],[{post_id:'closed',order_no:'A',quantity:50},{post_id:'full',order_no:'C',quantity:100}]);check(ids.has('closed'),false);check(ids.has('open'),true);check(ids.has('full'),false);
console.log(JSON.stringify({mode:'shipment closure API and outstanding-order visibility',passed}));
