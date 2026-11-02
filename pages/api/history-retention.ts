import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "@/lib/auth/server";
import { parseArchivePacket, validateRetentionSettings } from "@/lib/historyRetention";

export const config = { api: { bodyParser: { sizeLimit: "16mb" }, responseLimit: "16mb" } };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireApiUser(req, res, true);
  if (!auth) return;
  const db = auth.client;
  try {
    if (req.method === "GET") {
      const page = Number(req.query.page || 0);
      if (!Number.isInteger(page) || page < 0 || page > 100000) return res.status(400).json({ error: "ページが不正です" });
      const [settings, preview, events, ai] = await Promise.all([
        db.from("history_retention_settings").select("*").single(),
        db.rpc("preview_history_retention", { p_offset: page * 30 }),
        db.from("history_retention_events").select("*").order("created_at", { ascending: false }).order("id").limit(30),
        db.from("ai_prediction_settings").select("max_reference_days").eq("id", "global").maybeSingle(),
      ]);
      for (const result of [settings, preview, events, ai]) if (result.error) throw result.error;
      return res.status(200).json({ settings: settings.data, preview: preview.data, events: events.data, reference_days: ai.data?.max_reference_days || 730 });
    }
    if (req.method === "PUT") {
      const ai = await db.from("ai_prediction_settings").select("max_reference_days").eq("id", "global").maybeSingle();
      if (ai.error) throw ai.error;
      const settings = validateRetentionSettings(req.body, ai.data?.max_reference_days || 730);
      if (typeof req.body.updated_at !== "string") return res.status(400).json({ error: "設定を再読み込みしてください" });
      const result = await db.rpc("save_history_retention_settings", { p_detail: settings.detail_years, p_ai: settings.ai_years, p_prediction: settings.prediction_days, p_updated_at: req.body.updated_at });
      if (result.error) throw result.error;
      return res.status(200).json({ saved: true });
    }
    if (req.method === "POST") {
      if (req.body?.action === "export") {
        if (!/^[0-9a-f-]{36}$/i.test(req.body.post_id || "")) return res.status(400).json({ error: "注文IDが不正です" });
        const result = await db.rpc("prepare_history_export", { p_post: req.body.post_id });
        if (result.error) throw result.error;
        return res.status(200).json(result.data);
      }
      if (req.body?.action === "delete" || req.body?.action === "restore") {
        const packet = parseArchivePacket(req.body.archive);
        if (req.body.confirmation !== (req.body.action === "delete" ? "履歴削除" : "履歴復元")) return res.status(400).json({ error: "確認文字を入力してください" });
        const result = await db.rpc("execute_history_retention", { p_export: packet.export_id, p_packet: packet.payload, p_restore: req.body.action === "restore" });
        if (result.error) throw result.error;
        return res.status(200).json(result.data);
      }
      return res.status(400).json({ error: "操作が不正です" });
    }
    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "対応していない操作です" });
  } catch (error) {
    console.error("history-retention", error instanceof Error ? error.message : "database operation failed");
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return res.status(400).json({ error: message || "履歴管理の処理に失敗しました。再読み込みしてください。" });
  }
}
