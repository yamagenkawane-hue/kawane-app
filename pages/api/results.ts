import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

const RESULT_SELECT_COLUMNS =
  "id,post_id,schedule_id,order_process_id,process_id,process_name,date,amount,created_at";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("v_production_results_with_master")
        .select(RESULT_SELECT_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { data, error } = await supabase
        .from("production_results")
        .insert(req.body)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const { id, ...payload } = req.body;
      const { data, error } = await supabase
        .from("production_results")
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
        .from("production_results")
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
