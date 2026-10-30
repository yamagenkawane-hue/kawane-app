import supabase from "@/lib/supabase";

export async function authFetch(input: string, init: RequestInit={}) {
  if(!input.startsWith("/api/")) throw new Error("認証情報の送信先が不正です");
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session) throw new Error("ログインしてください");
  const headers=new Headers(init.headers);
  headers.set("Authorization",`Bearer ${data.session.access_token}`);
  return fetch(input,{...init,headers,cache:"no-store"});
}
