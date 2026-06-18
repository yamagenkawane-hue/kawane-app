import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

const toToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const today = String(req.query.date || toToday());
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .or(
          `and(shipping_scheduled_start.lte.${today},shipping_scheduled_end.gte.${today}),delivery_date.lt.${today}`,
        )
        .order("customer_name", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const { customer_name, product_name, press_number, plan_amount } =
        req.body || {};

      if (!customer_name || !product_name || !press_number) {
        return res.status(400).json({ error: "必須項目が不足しています" });
      }

      if (Number(plan_amount) < 0) {
        return res.status(400).json({ error: "数量は0以上で入力してください" });
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("production_schedules")
        .insert({ ...req.body, created_at: now, updated_at: now })
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
