import type { NextApiRequest,NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { requireApiUser } from "@/lib/auth/server";

export default async function handler(req:NextApiRequest,res:NextApiResponse) {
  const auth=await requireApiUser(req,res,true);
  if(!auth||!supabaseAdmin) return;
  try {
    if(req.method==="GET") {
      const {data,error}=await supabaseAdmin.from("app_profiles").select("id,login_id,manager,active").order("login_id");
      if(error) throw error;
      return res.status(200).json(data);
    }
    if(req.method!=="POST"&&req.method!=="PUT") {res.setHeader("Allow","GET, POST, PUT");return res.status(405).end();}
    const body=req.body||{};
    const name=typeof body.name==="string"?body.name.trim():"";
    const password=typeof body.password==="string"?body.password:"";
    if((req.method==="POST"||body.name!==undefined)&&(!name||name.length>128)) return res.status(400).json({error:"IDは1〜128文字で入力してください"});
    if((req.method==="POST"||password)&&(password.length<6||password.length>1024)) return res.status(400).json({error:"パスワードは6文字以上で入力してください"});
    if(body.manager!==undefined&&typeof body.manager!=="boolean"||body.active!==undefined&&typeof body.active!=="boolean") return res.status(400).json({error:"権限・有効状態の指定が不正です"});
    if(req.method==="POST") {
      const id=randomUUID(),email=`${id}@kawane-auth.invalid`;
      const {error:createError}=await supabaseAdmin.auth.admin.createUser({id,email,password,email_confirm:true});
      if(createError) throw createError;
      const {error}=await supabaseAdmin.from("app_profiles").insert({id,login_id:name,auth_email:email,manager:body.manager===true,active:true});
      if(error) {await supabaseAdmin.auth.admin.deleteUser(id);throw error;}
      return res.status(201).json({ok:true});
    }
    const id=typeof body.id==="string"?body.id:"";
    if(!id) return res.status(400).json({error:"ユーザーIDを指定してください"});
    if(id===auth.profile.id&&(body.active===false||body.manager===false)) return res.status(409).json({error:"自分自身の無効化・管理者解除はできません"});
    const {data:target,error:targetError}=await supabaseAdmin.from("app_profiles").select("id").eq("id",id).maybeSingle();
    if(targetError) throw targetError;
    if(!target) return res.status(404).json({error:"ユーザーが見つかりません"});
    // Enforce manager-count constraints before making irreversible Auth changes.
    const values:Record<string,unknown>={};
    if(body.name!==undefined) values.login_id=name;
    if(body.manager!==undefined) values.manager=body.manager;
    if(body.active!==undefined) values.active=body.active;
    if(Object.keys(values).length) {
      const {error}=await supabaseAdmin.from("app_profiles").update(values).eq("id",id);
      if(error) throw error;
    }
    if(password) {
      const {error}=await supabaseAdmin.auth.admin.updateUserById(id,{password});
      if(error) throw error;
      const {error:sessionError}=await supabaseAdmin.rpc("revoke_app_user_sessions",{p_id:id});
      if(sessionError) throw sessionError;
    }
    return res.status(200).json({ok:true});
  } catch(error) {
    const code=typeof error==="object"&&error&&"code" in error?String(error.code):"";
    return res.status(409).json({error:code==="23505"?"そのIDはすでに使用されています":"更新できません。最後の管理者の保護、入力内容、パスワード条件を確認してください。"});
  }
}
