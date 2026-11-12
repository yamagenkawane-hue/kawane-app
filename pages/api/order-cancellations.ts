import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import { requireApiUser, newAuthClient } from "@/lib/auth/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { mutationId, sendMutationError } from "@/lib/apiMutationValidation";
import { fetchAllRows } from "@/lib/fetchAllRows";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireApiUser(req, res, true);
  if (!auth) return;
  try {
    if (req.method === "GET") {
      const { data, error } = await fetchAllRows((from, to) => auth.client
        .from("order_cancellation_history")
        .select("id,post_id,order_no,customer_name,product_name,order_amount,cancelled_at,actor_name")
        .order("cancelled_at", { ascending: false }).order("id").range(from, to));
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).end(); }
    const body = req.body || {};
    const requestId = mutationId(body.request_id);
    if (!Array.isArray(body.post_ids) || !body.post_ids.length || body.post_ids.length > 100) return res.status(400).json({ error: "取消対象を1〜100件で指定してください" });
    const ids = body.post_ids.map(mutationId);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "取消対象が重複しています" });
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || password.length > 1024) return res.status(400).json({ error: "ログイン中の管理者のパスワードを入力してください" });
    if (!supabaseAdmin) return res.status(503).json({ error: "認証サービスが未設定です" });
    // Identity is taken only from the verified login session, never from the body.
    const token = String(req.headers.authorization).slice(7);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const sessionId = mutationId(claims.session_id);
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("consume_login_attempt", {
      p_key: createHash("sha256").update(`order-cancellation:${auth.user.id}`).digest("hex"),
    });
    if (limitError) return res.status(503).json({ error: "認証状態を確認できません。時間をおいて再実行してください" });
    if (!allowed) return res.status(429).json({ error: "パスワード確認が多いため、15分ほど待って再実行してください" });
    const { data: profile, error: profileError } = await supabaseAdmin.from("app_profiles")
      .select("id,auth_email,manager,active").eq("id", auth.user.id).maybeSingle();
    if (profileError) return res.status(503).json({ error: "管理者情報を確認できません" });
    if (!profile?.active || !profile.manager) return res.status(403).json({ error: "管理者のみ操作できます" });
    const verifier = newAuthClient();
    let verified = false;
    try {
      const { data, error } = await verifier.auth.signInWithPassword({ email: profile.auth_email, password });
      if (error) {
        const status = error.status === 429 ? 429 : [400, 401, 403, 422].includes(error.status || 0) ? 403 : 503;
        return res.status(status).json({ error: status === 403 ? "ログイン中の管理者のパスワードが違います" : "パスワードを確認できません。時間をおいて再実行してください" });
      }
      verified = data.user?.id === auth.user.id && Boolean(data.session);
    } finally {
      // Revoke only the temporary verification session; keep the original login.
      const { error } = await verifier.auth.signOut({ scope: "local" });
      if (error) verified = false;
    }
    if (!verified) return res.status(503).json({ error: "本人確認を完了できませんでした" });
    const { error } = await supabaseAdmin.rpc("cancel_mistaken_orders", {
      p_post_ids: ids, p_actor_id: auth.user.id, p_session_id: sessionId, p_request_id: requestId,
    });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) { return sendMutationError(res, error); }
}

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };
