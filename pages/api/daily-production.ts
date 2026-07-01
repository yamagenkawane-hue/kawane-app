import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

const DAILY_PRODUCTION_SELECT_COLUMNS =
  "id,delete,order_no,lot_no,product_code,product_name,customer_name,order_amount,remaining_amount,status,delivery_date,completion_scheduled_date,remark,created_at,updated_at,shipping_scheduled_start,shipping_scheduled_end";

const toToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

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
      const today = String(req.query.date || toToday());
      const [postResult, shipmentResult, processResult] = await Promise.all([
        supabase
          .from("v_posts_with_master")
          .select(DAILY_PRODUCTION_SELECT_COLUMNS)
          .or("delete.is.null,delete.eq.false")
          .or(
            [
              `and(shipping_scheduled_start.lte.${today},shipping_scheduled_end.gte.${today})`,
              `and(shipping_scheduled_start.is.null,shipping_scheduled_end.is.null,delivery_date.not.is.null)`,
              `delivery_date.lt.${today}`,
            ].join(","),
          )
          .order("customer_name", { ascending: true }),
        supabase.from("shipments").select("post_id,quantity"),
        supabase
          .from("v_order_processes_with_master")
          .select("post_id,process_order,completed_amount"),
      ]);

      if (postResult.error) throw postResult.error;
      if (shipmentResult.error) throw shipmentResult.error;
      if (processResult.error) throw processResult.error;

      const shippedMap = buildShippedMap(shipmentResult.data || []);
      const finalProcessCompletionMap = buildFinalProcessCompletionMap(
        processResult.data || [],
      );

      const activeBackorders = (postResult.data || []).filter((row) => {
        const orderAmount = Number(row.order_amount || 0);
        const shippedAmount = shippedMap.get(row.id) || 0;
        const completedAmount = finalProcessCompletionMap.get(row.id) || 0;

        return orderAmount > completedAmount && shippedAmount < orderAmount;
      });

      return res.status(200).json(activeBackorders);
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
