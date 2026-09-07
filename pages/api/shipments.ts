import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";
import supabaseAdmin, { hasSupabaseAdminConfig } from "@/lib/supabaseAdmin";

const SHIPMENT_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_code,product_name,lot_id,lot_no,scheduled_date,delivery_date,order_amount,quantity,cancelled,cancelled_at,cancelled_reason,created_at,updated_at";

const requiredFields = [
  "post_id",
  "order_no",
  "customer_name",
  "product_name",
  "lot_no",
  "scheduled_date",
  "quantity",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("v_shipments_with_master")
        .select(SHIPMENT_SELECT_COLUMNS)
        .eq("cancelled", false)
        .order("customer_name", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const missing = requiredFields.filter(
        (field) =>
          body[field] === undefined ||
          body[field] === null ||
          String(body[field]).trim() === "",
      );
      if (missing.length > 0) {
        return res.status(400).json({ error: `必須項目不足: ${missing.join(", ")}` });
      }

      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "出荷数は1以上で入力してください" });
      }

      const { error: deductError } = await supabase.rpc("ship_inventory_for_post", {
        p_post_id: body.post_id,
        p_quantity: quantity,
      });

      if (deductError) throw deductError;

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("shipments")
        .insert({
          post_id: body.post_id,
          order_no: body.order_no,
          customer_name: body.customer_name,
          product_name: body.product_name,
          lot_id: body.lot_id || null,
          lot_no: body.lot_no || "",
          scheduled_date: body.scheduled_date,
          delivery_date: body.delivery_date || null,
          order_amount: Number(body.order_amount || 0),
          quantity,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      const shipmentId = String(body.id || req.query.id || "");
      const isManager = body.is_manager === true || req.headers["x-manager"] === "true";
      const reason = String(body.reason || "出荷取消");
      const cancelPassword = String(body.cancel_password || "");

      if (!shipmentId) {
        return res.status(400).json({ error: "出荷履歴IDを指定してください" });
      }

      if (!isManager) {
        return res.status(403).json({ error: "出荷取消は管理者のみ操作できます" });
      }

      if (!process.env.SHIPMENT_CANCEL_PASSWORD) {
        return res.status(500).json({
          error: "出荷取消用パスワードがサーバーに設定されていません",
        });
      }

      if (cancelPassword !== process.env.SHIPMENT_CANCEL_PASSWORD) {
        return res.status(403).json({ error: "出荷取消用パスワードが違います" });
      }

      if (!hasSupabaseAdminConfig || !supabaseAdmin) {
        return res.status(500).json({
          error: "Supabase管理用キーがサーバーに設定されていません",
        });
      }

      const { error } = await supabaseAdmin.rpc("cancel_shipment_and_restore_inventory", {
        p_shipment_id: shipmentId,
        p_reason: reason,
      });

      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);

    return res.status(500).json({ error: message });
  }
}
