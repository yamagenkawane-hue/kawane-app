import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

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
        .from("shipments")
        .select("*")
        .order("customer_name", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const missing = requiredFields.filter((field) => !body[field]);
      if (missing.length > 0) {
        return res.status(400).json({ error: `必須項目不足: ${missing.join(", ")}` });
      }

      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "出荷数は1以上で入力してください" });
      }

      const { error: deductError } = await supabase.rpc("deduct_inventory", {
        p_product_code: body.product_code || "",
        p_lot_no: body.lot_no,
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
          lot_no: body.lot_no,
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

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
