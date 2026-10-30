// Explicit migration utility. Passwords are processed in memory and never logged.
import {createClient} from '@supabase/supabase-js';
try {process.loadEnvFile('.env.local');} catch {}
if(!process.argv.includes('--execute')) throw Error('Use --execute only after approving the account migration.');
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:legacy,error}=await client.from('user').select('id,name,pass,manager,delete');
if(error) throw Error('Cannot read legacy accounts');
const {data:existing,error:listError}=await client.auth.admin.listUsers({page:1,perPage:1000});
if(listError) throw Error('Cannot inspect Auth accounts');
const existingIds=new Set(existing.users.map(user=>user.id));
for(const account of legacy) {
  if(account.delete) continue;
  const password=account.name==='test'?process.env.KAWANE_TEST_MIGRATION_PASSWORD:account.pass;
  if(!password||password.length<6) throw Error(`Password reset required for account ${account.name}`);
  const email=`${account.id}@kawane-auth.invalid`;
  if(!existingIds.has(account.id)) {
    const {error}=await client.auth.admin.createUser({id:account.id,email,password,email_confirm:true});
    if(error) throw Error(`Auth account migration failed for ${account.name} (${error.code||'unknown'})`);
  }
  const verifier=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error:loginError}=await verifier.auth.signInWithPassword({email,password});
  if(loginError||data.user?.id!==account.id) throw Error(`Auth login verification failed for ${account.name}`);
  await verifier.auth.signOut();
  console.log(`Auth account prepared and password verified: ${account.name}`);
}
