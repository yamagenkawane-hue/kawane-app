// Rehearse against table shapes and function bodies read from production, without business data.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const tables=JSON.parse(fs.readFileSync('docs/auth_table_schema_before_20261030.json','utf8'));
const snapshot=JSON.parse(fs.readFileSync('docs/auth_permissions_before_20261030.json','utf8'));
const quote=text=>'"'+text.replaceAll('"','""')+'"';
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
  `);
  for(const table of tables) await db.exec(`create table public.${quote(table.name)}(${table.columns.map(c=>quote(c.name)+' '+c.type).join(',')})`);
  for(const f of snapshot.functions) await db.exec(f.definition);
  await db.exec(`insert into auth.users values('00000000-0000-0000-0000-000000000001','manager@example.invalid');
    insert into public."user"(id,name,manager,"delete") values('00000000-0000-0000-0000-000000000001','manager',true,false)`);
  await db.exec(fs.readFileSync('supabase/migrations/20261030070357_secure_auth_and_permissions.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261030072432_pin_workflow_function_search_paths.sql','utf8'));
  console.log(JSON.stringify({mode:'production schema rehearsal without business data',tables:tables.length,functions:snapshot.functions.length,success:true}));
} catch(error) {console.error(error.message,error.where,error.internalQuery);process.exitCode=1;}
finally {await db.close();}
