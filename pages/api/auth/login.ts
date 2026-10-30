import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { newAuthClient } from "@/lib/auth/server";
import { createHash } from "node:crypto";

export default async function handler(req:NextApiRequest,res:NextApiResponse) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") {res.setHeader("Allow","POST");return res.status(405).end();}
  const loginId=typeof req.body?.loginId==="string"?req.body.loginId.trim():"";
  const password=typeof req.body?.password==="string"?req.body.password:"";
  if(!loginId||loginId.length>128||!password||password.length>1024) return res.status(400).json({error:"IDとパスワードを確認してください"});
  if(!supabaseAdmin) return res.status(503).json({error:"認証サービスが未設定です"});
  try {
    const key=createHash("sha256").update(`login:${loginId}`).digest("hex");
    const {data:allowed,error:limitError}=await supabaseAdmin.rpc("consume_login_attempt",{p_key:key});
    if(limitError) throw limitError;
    if(!allowed) return res.status(429).json({error:"ログイン試行が多いため、15分ほど待って再実行してください"});
    // Login IDs remain unchanged. Internal Auth identities are never sent to the UI.
    const {data:profile,error}=await supabaseAdmin.from("app_profiles").select("id,auth_email,active").eq("login_id",loginId).maybeSingle();
    if(error) throw error;
    const email=profile?.auth_email||"unknown@kawane-auth.invalid";
    const {data,error:authError}=await newAuthClient().auth.signInWithPassword({email,password});
    if(authError||!profile?.active||!data.session) return res.status(401).json({error:"IDまたはパスワードが違うか、アカウントが無効です"});
    return res.status(200).json({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  } catch {return res.status(503).json({error:"ログインできません。認証サービスの設定を確認してください"});}
}
