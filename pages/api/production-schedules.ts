import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

const SCHEDULE_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_name,press_number,lot_no,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_start,shipping_scheduled_end,created_at,updated_at";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("v_production_schedules_with_master")
        .select(SCHEDULE_SELECT_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { data, error } = await supabase
        .from("production_schedules")
        .insert(req.body)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const { id, ...payload } = req.body;
      const { data, error } = await supabase
        .from("production_schedules")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.body?.id || "");
      const { error } = await supabase
        .from("production_schedules")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    return res.status(500).json({ error });
  }
}
