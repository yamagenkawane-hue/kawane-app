// Explicitly authorized live checks only. Login/logout change Auth sessions and login counters.
// Business data is read only; dedicated credentials come from the operator, never legacy storage.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export function verificationConfig(env) {
  if(env.KAWANE_ALLOW_LIVE_AUTH_TEST!=='yes') throw Error('Live Auth checks require explicit approval and KAWANE_ALLOW_LIVE_AUTH_TEST=yes');
  const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','KAWANE_VERIFY_ORIGIN',
    'KAWANE_VERIFY_WORKER_ID','KAWANE_VERIFY_WORKER_PASSWORD','KAWANE_VERIFY_ADMIN_ID','KAWANE_VERIFY_ADMIN_PASSWORD'];
  for(const key of required) if(!env[key]?.trim()) throw Error(`Missing required setting: ${key}`);
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','KAWANE_VERIFY_ORIGIN']) {
    let parsed;
    try {parsed=new URL(env[key]);} catch {throw Error(`Invalid URL setting: ${key}`);}
    const local=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
    if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||
      !(parsed.protocol==='https:'||(local&&parsed.protocol==='http:'))) throw Error(`Unsafe origin setting: ${key}`);
  }
  if(env.KAWANE_VERIFY_WORKER_ID===env.KAWANE_VERIFY_ADMIN_ID) throw Error('Use separate dedicated worker and administrator accounts');
  return {url:env.NEXT_PUBLIC_SUPABASE_URL,key:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    origin:new URL(env.KAWANE_VERIFY_ORIGIN).origin,accounts:[
      {loginId:env.KAWANE_VERIFY_WORKER_ID,password:env.KAWANE_VERIFY_WORKER_PASSWORD,manager:false},
      {loginId:env.KAWANE_VERIFY_ADMIN_ID,password:env.KAWANE_VERIFY_ADMIN_PASSWORD,manager:true},
    ]};
}

async function main() {
  try {process.loadEnvFile('.env.local');} catch {}
  // All settings and opt-in are checked before constructing clients or making requests.
  const {url,key,origin,accounts}=verificationConfig(process.env);
  const {createClient}=await import('@supabase/supabase-js');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const anon=createClient(url,key,options);
  let passed=0;const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
  const request=async(path,method='GET',token,body)=>fetch(origin+path,{method,redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  check(Boolean((await anon.from('posts').select('id').limit(1)).error),true);
  check(Boolean((await anon.from('v_posts_with_master').select('id').limit(1)).error),true);
  check(Boolean((await anon.from('user').select('id').limit(1)).error),true);
  check((await request('/api/ai-predictions/status')).status,401);
  check((await request('/api/shipments')).status,401);
  for(const account of accounts) {
    const response=await request('/api/auth/login','POST',null,{loginId:account.loginId,password:account.password});
    if(response.status!==200) throw Error(`Dedicated ${account.manager?'admin':'worker'} login failed (${response.status})`);
    passed++;
    const session=await response.json(),token=session.access_token;
    const client=createClient(url,key,options);
    try {
      const {error}=await client.auth.setSession(session);
      if(error) throw Error('Could not initialize verification session');
      const me=await request('/api/auth/me','GET',token);check(me.status,200);
      const profile=await me.json();check(profile.login_id,account.loginId);check(profile.manager,account.manager);
      check('pass' in profile||'auth_email' in profile,false);
      check((await client.from('v_posts_with_master').select('id').limit(1)).error,null);
      const profiles=await client.from('app_profiles').select('id,login_id,manager,active');
      check(profiles.error,null);check(profiles.data.length,1);
      check(Boolean((await client.from('app_profiles').select('auth_email')).error),true);
      check(Boolean((await client.from('user').select('id')).error),true);
      check((await request('/api/daily-production','GET',token)).status,200);
      check((await request('/api/masters/product-processes','GET',token)).status,200);
      check((await request('/api/ai-predictions/run','GET',token)).status,account.manager?405:403);
      if(!account.manager) {
        check((await request('/api/shipments','DELETE',token,{id:'not-used',is_manager:true,cancel_password:'ignored'})).status,403);
        check((await request('/api/auth/users','GET',token)).status,403);
      }
      check((await client.auth.signOut({scope:'local'})).error,null);
      const revoked=await request('/api/auth/me','GET',token);
      check([401,403].includes(revoked.status),true);
    } finally {
      const {error}=await client.auth.signOut({scope:'local'});
      if(error) throw Error('Verification session cleanup failed; operator must revoke dedicated test sessions');
    }
    console.log(`Verified dedicated ${account.manager?'admin':'worker'} account: login, role, RLS, API, logout`);
  }
  console.log(JSON.stringify({mode:'authorized live Auth mutations; business-data reads only',passed},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
