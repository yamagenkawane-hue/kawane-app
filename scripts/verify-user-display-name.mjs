// Offline account API and self-edit UI; no real accounts or passwords.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let passed=0,manager=true;const writes=[];
const check=(a,b)=>{assert.deepEqual(a,b);passed++;};
function load(file,mocks){const context={exports:{},console,alert(){},require(name){if(name in mocks)return mocks[name];if(name.endsWith('.css'))return{__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};return require(name);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);return context.exports;}
const db={from(){const q={select(){return q;},eq(){return q;},order:async()=>({data:[],error:null}),maybeSingle:async()=>({data:{id:'self'},error:null}),insert(payload){writes.push(payload);return Promise.resolve({error:null});},update(payload){writes.push(payload);return q;},then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}};return q;},auth:{admin:{createUser:async()=>({error:null}),updateUserById:async()=>({error:null})}}};
const api=load('pages/api/auth/users.ts',{'@/lib/auth/server':{requireApiUser:async(req,res)=>{if(!manager){res.status(403).json({error:'denied'});return null;}return{profile:{id:'self'}};}},'@/lib/supabaseAdmin':{__esModule:true,default:db}}).default;
async function request(body,method='PUT'){const res={code:200,status(n){this.code=n;return this;},json(){return this;},end(){return this;},setHeader(){}};await api({method,body},res);return res;}
for(const display_name of [5,{},null,'a'.repeat(101)])check((await request({id:'self',display_name})).code,400);
check(writes.length,0);check((await request({id:'self',display_name:' 担当者名 '})).code,200);check(writes[0].display_name,'担当者名');check(Object.keys(writes[0]).join(','),'display_name');
check((await request({id:'self',display_name:'',manager:false})).code,409);
check((await request({name:'new-login',password:'synthetic',display_name:'新規担当者'},'POST')).code,201);check(writes.at(-1).display_name,'新規担当者');
manager=false;const before=writes.length;check((await request({id:'self',display_name:'改名'})).code,403);check(writes.length,before);manager=true;
// Current manager may change the display name without changing login credentials/rights.
const user={id:'self',name:'admin-login',displayName:'登録前',pass:'',manager:true,delete:false};
const values=[[user],[],null,'','',false,false,''],calls=[];let si=0,refreshed=0;
const Page=load('app/userManager/page.tsx',{react:{...require('react'),useState(initial){const i=si++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useEffect(){},useCallback:fn=>fn},'@/app/components/AuthProvider/AuthProvider':{useAppAuth:()=>({profile:{id:'self'},refresh:async()=>{refreshed++;}})},'@/lib/auth/client':{authFetch:async(url,args)=>{if(args){calls.push(JSON.parse(args.body));return{ok:true};}return{ok:true,json:async()=>[{id:'self',login_id:'admin-login',display_name:'担当者名',manager:true,active:true}]};}}}).default;
const render=()=>{si=0;return Page();};
function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
let tree=render();nodes(tree).find(n=>n.type==='button'&&n.props.title==='表示名を編集').props.onClick();tree=render();
check(nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='ログインID').props.disabled,true);
check(nodes(tree).find(n=>n.type==='input'&&n.props.type==='password').props.disabled,true);
check(nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.disabled,true);
nodes(tree).find(n=>n.type==='input'&&n.props.id==='edit-display-name').props.onChange({target:{value:'担当者名'}});tree=render();
await nodes(tree).find(n=>n.type==='button'&&n.props.children==='保存').props.onClick();
check(JSON.stringify(calls[0]),JSON.stringify({id:'self',display_name:'担当者名'}));check(refreshed,1);check(values[0][0].displayName,'担当者名');
console.log(JSON.stringify({mode:'display-name validation, manager authorization, create/edit and own-name-only UI',passed}));
