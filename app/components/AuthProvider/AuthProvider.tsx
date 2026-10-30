"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { authFetch } from "@/lib/auth/client";
import type { AppProfile } from "@/lib/auth/server";
import LoginForm from "../LoginForm/LoginForm";

const AuthContext=createContext<{profile:AppProfile|null;refresh:()=>Promise<void>}>({profile:null,refresh:async()=>{}});
export const useAppAuth=()=>useContext(AuthContext);
const managerPages=new Set(["settings","masterSettings","userManager","managerMenu","managerDelete","newRegistration","create","customerMaster","productMaster","productProcesses","processMaster","materialMaster","lineMaster","subcontractors","inventoryMaster","calendar","aiPredictionSettings","orderProcesses"]);

export default function AuthProvider({children}:{children:ReactNode}) {
  const [profile,setProfile]=useState<AppProfile|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const pathname=usePathname();
  const refresh=async()=>{
    try {
      const {data}=await supabase.auth.getSession();
      if(!data.session) {setProfile(null);return;}
      const response=await authFetch("/api/auth/me");
      if(!response.ok) {setProfile(null);setMessage("ログイン状態を確認できません。再ログインしてください。");return;}
      setProfile(await response.json());setMessage("");
    } catch {setProfile(null);setMessage("認証サービスに接続できません。");}
    finally {setLoading(false);}
  };
  useEffect(()=>{
    // Remove the previous plaintext/boolean login cache; it is never trusted.
    localStorage.removeItem("loggedInUser");localStorage.removeItem("isManagerIn");
    let active=true;
    const update=()=>{if(active) void refresh();};
    const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(update,0);});
    const timer=setTimeout(update,0);
    window.addEventListener("focus",update);
    return ()=>{active=false;clearTimeout(timer);data.subscription.unsubscribe();window.removeEventListener("focus",update);};
  },[]);
  if(loading) return <p role="status">ログイン状態を確認中…</p>;
  return <AuthContext.Provider value={{profile,refresh}}>
    {!profile?<div style={{maxWidth:480,margin:"48px auto",padding:20}}>{message&&<p role="alert">{message}</p>}<LoginForm onLoginSuccess={()=>void refresh()}/></div>
      :(managerPages.has((pathname||"/").split("/")[1])||pathname?.startsWith("/lots/deleted"))&&!profile.manager?<div><p role="alert">この画面は管理者のみ利用できます。</p><Link href="/">トップページへ戻る</Link></div>:children}
  </AuthContext.Provider>;
}
