import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin configuration is missing" });

  const [runResponse, scheduledRunResponse, evaluationResponse, evaluationDetailsResponse] = await Promise.all([
    supabaseAdmin
      .from("ai_prediction_runs")
      .select("id,status,model,trigger_type,started_at,finished_at,target_count,success_count,failed_count,skipped_count,error_code,error_message")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("ai_prediction_runs")
      .select("id,status,started_at,finished_at,target_count,success_count,failed_count,skipped_count,error_code,error_message")
      .eq("trigger_type", "scheduled")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("ai_prediction_evaluations")
      .select("business_day_error")
      .not("business_day_error", "is", null),
    supabaseAdmin
      .from("ai_prediction_evaluations")
      .select("id,order_no,predicted_completion_date,actual_completion_date,business_day_error,lead_business_days,created_at")
      .not("actual_completion_date", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (runResponse.error) return res.status(500).json({ error: runResponse.error.message });
  if (scheduledRunResponse.error) return res.status(500).json({ error: scheduledRunResponse.error.message });
  if (evaluationResponse.error) return res.status(500).json({ error: evaluationResponse.error.message });
  if (evaluationDetailsResponse.error) return res.status(500).json({ error: evaluationDetailsResponse.error.message });
  if (!runResponse.data) {
    return res.status(200).json({
      cron_configured: Boolean(process.env.CRON_SECRET),
      schedule_label: "毎朝7:00（日本時間）",
      latest_scheduled_run: scheduledRunResponse.data,
      evaluation_details: evaluationDetailsResponse.data || [],
    });
  }
  const { data: unavailableRows, error: unavailableError } = await supabaseAdmin
    .from("ai_prediction_results")
    .select("order_no,process_name,reason")
    .eq("run_id", runResponse.data.id)
    .eq("status", "unavailable")
    .order("order_no", { ascending: true })
    .order("process_order", { ascending: true });
  if (unavailableError) return res.status(500).json({ error: unavailableError.message });
  const errors = (evaluationResponse.data || []).map((row) => Number(row.business_day_error || 0));
  const averageAbsoluteError = errors.length
    ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length
    : null;
  return res.status(200).json({
    ...runResponse.data,
    evaluation_count: errors.length,
    average_absolute_error: averageAbsoluteError,
    cron_configured: Boolean(process.env.CRON_SECRET),
    schedule_label: "毎朝7:00（日本時間）",
    latest_scheduled_run: scheduledRunResponse.data,
    evaluation_details: evaluationDetailsResponse.data || [],
    failure_details: unavailableRows || [],
  });
}
