import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import supabaseAdmin from "@/lib/supabaseAdmin";

export type AppProfile = { id: string; login_id: string; manager: boolean; active: boolean };

export async function requireApiUser(req: NextApiRequest, res: NextApiResponse, managerOnly=false) {
  res.setHeader("Cache-Control","no-store");
  const header=req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {res.status(401).json({error:"ログインしてください"});return null;}
  if (!supabaseAdmin) {res.status(503).json({error:"認証サービスが未設定です"});return null;}
  try {
    const token=header.slice(7);
    const {data,error}=await supabaseAdmin.auth.getUser(token);
    if(error||!data.user) {res.status(401).json({error:"ログインの有効期限が切れています"});return null;}
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
      global:{headers:{Authorization:header}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    const {data:profile,error:profileError}=await client.from("app_profiles")
      .select("id,login_id,manager,active").eq("id",data.user.id).maybeSingle();
    if(profileError) throw profileError;
    if(!profile?.active||(managerOnly&&!profile.manager)) {res.status(403).json({error:"この操作を行う権限がありません"});return null;}
    return {profile:profile as AppProfile,client,user:data.user};
  } catch {
    res.status(503).json({error:"認証状態を確認できません。時間をおいて再実行してください"});return null;
  }
}

export function newAuthClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
}
