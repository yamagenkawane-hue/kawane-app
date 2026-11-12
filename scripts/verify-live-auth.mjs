// Authentication/read-only business-data checks. Never performs AI runs or business mutations.
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
try {process.loadEnvFile('.env.local');} catch {}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const anon=createClient(url,key,options);
let passed=0;const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
const origin=process.env.KAWANE_VERIFY_ORIGIN||'http://localhost:3000';
const request=async(path,method='GET',token,body)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
check(Boolean((await anon.from('posts').select('id').limit(1)).error),true);
check(Boolean((await anon.from('v_posts_with_master').select('id').limit(1)).error),true);
check(Boolean((await anon.from('user').select('id').limit(1)).error),true);
check((await request('/api/ai-predictions/status')).status,401);
check((await request('/api/shipments')).status,401);
check((await request('/api/history-retention')).status,401);
check((await request('/api/outsource-history')).status,401);
if(!process.env.KAWANE_TEST_MIGRATION_PASSWORD) throw Error('Set the dedicated test account password. Legacy credentials are never read.');
const accounts=[{name:process.env.KAWANE_TEST_LOGIN_ID||'test',password:process.env.KAWANE_TEST_MIGRATION_PASSWORD}];
if(process.argv.includes('--include-manager')) {
  if(!process.env.KAWANE_TEST_MANAGER_LOGIN_ID||!process.env.KAWANE_TEST_MANAGER_PASSWORD) throw Error('Set a dedicated manager test account explicitly');
  accounts.push({name:process.env.KAWANE_TEST_MANAGER_LOGIN_ID,password:process.env.KAWANE_TEST_MANAGER_PASSWORD});
}
for(const account of accounts) {
  const password=account.password;
  const response=await request('/api/auth/login','POST',null,{loginId:account.name,password});
  if(response.status!==200) throw Error(`Login failed for ${account.name} (${response.status})`);
  passed++;
  const session=await response.json(),token=session.access_token;
  const me=await request('/api/auth/me','GET',token);check(me.status,200);
  const profile=await me.json();check(profile.login_id,account.name);check(typeof profile.manager,'boolean');
  const manager=profile.manager;
  check('pass' in profile||'auth_email' in profile,false);
  const client=createClient(url,key,options);await client.auth.setSession(session);
  try {
    check((await client.from('v_posts_with_master').select('id').limit(1)).error,null);
    check((await client.from('app_profiles').select('id,login_id,manager,active')).data.length,1);
    check(Boolean((await client.from('app_profiles').select('auth_email')).error),true);
    check(Boolean((await client.from('user').select('pass')).error),true);
    check((await request('/api/daily-production','GET',token)).status,200);
    const retentionResponse=await request('/api/history-retention','GET',token);
    check(retentionResponse.status,manager?200:403);
    if(manager) {
      const body=await retentionResponse.json();check(body.settings.detail_years,3);check(body.settings.ai_years,5);check(Array.isArray(body.preview.rows),true);
    } else {
      const blocked=await client.rpc('execute_history_retention',{p_export:'00000000-0000-0000-0000-000000000000',p_packet:{},p_restore:false});check(Boolean(blocked.error),true);
      check((await client.from('history_retention_settings').select('*')).data.length,0);
    }
    check((await request('/api/outsource-history','GET',token)).status,200);
    check((await request('/api/masters/product-processes','GET',token)).status,200);
    check((await request('/api/ai-predictions/run','GET',token)).status,manager?405:403);
    if(!manager) {
      check((await request('/api/shipments','DELETE',token,{id:'not-used',is_manager:true,cancel_password:'ignored'})).status,403);
      check((await request('/api/auth/users','GET',token)).status,403);
    }
    await client.auth.signOut({scope:'local'});
    const revoked=await request('/api/auth/me','GET',token);
    check([401,403].includes(revoked.status),true);
  } finally {await client.auth.signOut({scope:'local'});}
  console.log(`Verified login, role, RLS, API, and logout: ${account.name}`);
}
console.log(JSON.stringify({mode:'live Auth/API and business-data reads only',passed},null,2));
