import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "@/lib/auth/server";
import { fetchAllRows } from "@/lib/fetchAllRows";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireApiUser(req, res);
  if (!auth) return;
  try {
    if (req.method === "GET") {
      const { data, error } = await fetchAllRows((from, to) => auth.client
        .from("order_shipment_closures")
        .select("id,post_id,order_no,customer_name,product_name,order_amount,shipped_amount,closed_quantity,reason,actor_name,closed_at")
        .order("closed_at", { ascending: false }).order("id").range(from, to));
      if (error) throw error;
      return res.status(200).json(data || []);
    }
    if (req.method === "POST") {
      const { post_id, reason, request_id } = req.body || {};
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof post_id !== "string" || !uuid.test(post_id) || typeof request_id !== "string" || !uuid.test(request_id)
        || typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
        return res.status(400).json({ error: "注番と打ち切り理由（500文字以内）を確認してください" });
      }
      const { data, error } = await auth.client.rpc("close_order_shipments", {
        p_post_id: post_id, p_reason: reason.trim(), p_request_id: request_id,
      });
      if (error) return res.status(error.code === "P0001" ? 409 : error.code === "42501" ? 403 : 500).json({ error: error.message });
      return res.status(201).json(data);
    }
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message
      : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "打ち切り処理に失敗しました" });
  }
}
