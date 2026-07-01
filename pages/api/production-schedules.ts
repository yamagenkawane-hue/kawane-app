import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

const SCHEDULE_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_name,press_number,lot_no,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_start,shipping_scheduled_end,created_at,updated_at";

const POST_SELECT_COLUMNS = "id,delete,order_no,order_amount";

const buildShippedMap = (rows: { post_id?: string | null; quantity?: number | null }[]) => {
  const shippedMap = new Map<string, number>();
  for (const row of rows || []) {
    const postId = row.post_id || "";
    if (!postId) continue;
    shippedMap.set(postId, (shippedMap.get(postId) || 0) + Number(row.quantity || 0));
  }
  return shippedMap;
};

const buildFinalProcessCompletionMap = (
  rows: {
    post_id?: string | null;
    process_order?: number | null;
    completed_amount?: number | null;
  }[],
) => {
  const finalProcessMap = new Map<
    string,
    { processOrder: number; completedAmount: number }
  >();

  for (const row of rows || []) {
    const postId = row.post_id || "";
    if (!postId) continue;

    const processOrder = Number(row.process_order || 0);
    const completedAmount = Number(row.completed_amount || 0);
    const current = finalProcessMap.get(postId);
    if (!current || processOrder > current.processOrder) {
      finalProcessMap.set(postId, { processOrder, completedAmount });
    }
  }

  return new Map(
    Array.from(finalProcessMap.entries()).map(([postId, value]) => [
      postId,
      value.completedAmount,
    ]),
  );
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const [scheduleResult, postResult, shipmentResult, processResult] =
        await Promise.all([
          supabase
            .from("v_production_schedules_with_master")
            .select(SCHEDULE_SELECT_COLUMNS)
            .order("created_at", { ascending: false }),
          supabase
            .from("v_posts_with_master")
            .select(POST_SELECT_COLUMNS)
            .or("delete.is.null,delete.eq.false"),
          supabase.from("shipments").select("post_id,quantity"),
          supabase
            .from("v_order_processes_with_master")
            .select("post_id,process_order,completed_amount"),
        ]);

      if (scheduleResult.error) throw scheduleResult.error;
      if (postResult.error) throw postResult.error;
      if (shipmentResult.error) throw shipmentResult.error;
      if (processResult.error) throw processResult.error;

      const shippedMap = buildShippedMap(shipmentResult.data || []);
      const finalProcessCompletionMap = buildFinalProcessCompletionMap(
        processResult.data || [],
      );
      const activePosts = (postResult.data || []).filter((row) => {
        const orderAmount = Number(row.order_amount || 0);
        const shippedAmount = shippedMap.get(row.id) || 0;
        const completedAmount = finalProcessCompletionMap.get(row.id) || 0;
        return orderAmount > completedAmount && shippedAmount < orderAmount;
      });
      const activePostIds = new Set(activePosts.map((row) => row.id));
      const activeOrderNos = new Set(activePosts.map((row) => row.order_no));
      const filteredSchedules = (scheduleResult.data || []).filter((row) => {
        if (row.post_id && activePostIds.has(row.post_id)) return true;
        if (row.order_no && activeOrderNos.has(row.order_no)) return true;
        return false;
      });

      return res.status(200).json(filteredSchedules);
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
