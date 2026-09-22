import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin configuration is missing" });

  const { data, error } = await supabaseAdmin
    .from("ai_prediction_runs")
    .select("id,status,model,trigger_type,started_at,finished_at,target_count,success_count,failed_count,skipped_count,error_code,error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data || null);
}
