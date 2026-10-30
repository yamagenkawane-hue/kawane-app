// Offline regression tests: synthetic strings only, no clients, login, or network requests.
import assert from 'node:assert/strict';
import {verificationConfig} from './verify-live-auth.mjs';
let passed=0;
const reject=(env,pattern)=>{assert.throws(()=>verificationConfig(env),pattern);passed++;};
reject({},/explicit approval/);
reject({KAWANE_ALLOW_LIVE_AUTH_TEST:'no'},/explicit approval/);
reject({KAWANE_ALLOW_LIVE_AUTH_TEST:'yes'},/Missing required/);
const valid={KAWANE_ALLOW_LIVE_AUTH_TEST:'yes',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-key',KAWANE_VERIFY_ORIGIN:'http://localhost:3000',
  KAWANE_VERIFY_WORKER_ID:'worker',KAWANE_VERIFY_WORKER_PASSWORD:'synthetic-worker',
  KAWANE_VERIFY_ADMIN_ID:'admin',KAWANE_VERIFY_ADMIN_PASSWORD:'synthetic-admin'};
for(const field of Object.keys(valid).filter(key=>key!=='KAWANE_ALLOW_LIVE_AUTH_TEST')) {
  reject({...valid,[field]:''},/Missing required/);
}
for(const url of ['not-url','http://example.com','https://a:b@example.com','https://example.com/path',
  'https://example.com/?token=x','https://example.com/#x']) {
  reject({...valid,KAWANE_VERIFY_ORIGIN:url},/Invalid URL|Unsafe origin/);
}
reject({...valid,KAWANE_VERIFY_ADMIN_ID:'worker'},/separate dedicated/);
const config=verificationConfig(valid);
assert.equal(config.accounts[0].manager,false);passed++;
assert.equal(config.accounts[1].manager,true);passed++;
assert.equal(config.origin,'http://localhost:3000');passed++;
console.log(JSON.stringify({mode:'offline live-auth configuration unit tests',passed},null,2));
