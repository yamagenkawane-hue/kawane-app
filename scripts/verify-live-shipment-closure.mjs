// Live read-only checks. RPC tests deliberately reject invalid input before business locks/writes.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const origin=process.env.KAWANE_VERIFY_ORIGIN || 'http://localhost:3000';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const anon=createClient(url,key,options),member=createClient(url,key,options);
let passed=0;const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const request=(path,method='GET',token,body)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
check((await request('/api/shipment-closures')).status,401);
check((await request('/api/shipment-closures','POST',null,{})).status,401);
check((await request('/api/shipment-closures','PATCH',null,{})).status,401);
check(Boolean((await anon.from('order_shipment_closures').select('id').limit(1)).error),true);
const noAccess=await anon.rpc('close_order_shipments',{p_post_id:'00000000-0000-0000-0000-000000000000',p_reason:'',p_request_id:'00000000-0000-0000-0000-000000000000'});
check(Boolean(noAccess.error),true);
check(Boolean((await anon.rpc('ship_stock_and_close_order',{p_post_id:null,p_scheduled_date:null,p_reason:'理由入力なし',p_request_id:null})).error),true);
check(Boolean((await anon.rpc('restore_order_shipments',{p_closure_id:null,p_request_id:null})).error),true);
const login=await request('/api/auth/login','POST',null,{loginId:'test',password:process.env.KAWANE_TEST_MIGRATION_PASSWORD});
check(login.status,200);const session=await login.json();await member.auth.setSession(session);
try {
 const response=await request('/api/shipment-closures','GET',session.access_token);check(response.status,200);const logs=await response.json();check(Array.isArray(logs),true);
 check((await request('/api/shipment-closures','POST',session.access_token,{})).status,400);
 check((await request('/api/shipment-closures','PATCH',session.access_token,{})).status,400);
 for(const row of logs)check('restored_at' in row && 'restored_actor_name' in row,true);
 const invalidRestore=await member.rpc('restore_order_shipments',{p_closure_id:null,p_request_id:null});
 check(invalidRestore.error?.code,'P0001');
 check(invalidRestore.error.message.includes('処理キー'),true);
 const history=await member.from('order_shipment_closures').select('id').limit(1);check(history.error,null);
 const posts=await member.from('v_posts_with_master').select('id,shipment_closed_at').is('shipment_closed_at',null).limit(1);check(posts.error,null);
 const stock=await member.from('v_shipping_candidates').select('post_id,available_quantity').limit(1);check(stock.error,null);
 const invalid=await member.rpc('ship_stock_and_close_order',{p_post_id:null,p_scheduled_date:null,p_reason:'理由入力なし',p_request_id:null});
 check(invalid.error?.code,'P0001');check(invalid.error.message.includes('処理キー'),true);
 const after=await request('/api/shipment-closures','GET',session.access_token);check((await after.json()).length,logs.length);
 console.log(JSON.stringify({mode:'live closure authorization and reads; no valid closure submitted',origin,passed,historyCount:logs.length}));
} finally {await member.auth.signOut({scope:'local'});}
