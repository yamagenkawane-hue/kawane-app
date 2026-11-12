import { mutationPayload, sendMutationError } from "@/lib/apiMutationValidation";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isCalendarDate } from "@/lib/orderEntry";
import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";


const DAILY_PRODUCTION_SELECT_COLUMNS =
  "id,product_id,customer_id,delete,order_no,lot_no,planned_start_date,product_code,product_name,customer_name,order_amount,remaining_amount,status,delivery_date,completion_scheduled_date,remark,created_at,updated_at,shipping_scheduled_start,shipping_scheduled_end";

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
  const auth=await requireApiUser(req,res,req.method === "DELETE");
  if(!auth) return;
  const supabase=auth.client;

  try {
    if (req.method === "GET") {
      const today = req.query.date === undefined ? toToday() : req.query.date;
      if (typeof today !== "string" || !isCalendarDate(today)) return res.status(400).json({ error: "正しい対象日を指定してください" });
      const [postResult, shipmentResult, processResult] = await Promise.all([
        fetchAllRows((from, to) => supabase
          .from("v_posts_with_master")
          .select(DAILY_PRODUCTION_SELECT_COLUMNS).is("shipment_closed_at", null)
          .or("delete.is.null,delete.eq.false")
          .or(
            [
              `and(shipping_scheduled_start.lte.${today},shipping_scheduled_end.gte.${today})`,
              `and(shipping_scheduled_start.is.null,shipping_scheduled_end.is.null,delivery_date.not.is.null)`,
              `delivery_date.lt.${today}`,
            ].join(","),
          )
          .order("customer_name", { ascending: true }).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase
          .from("shipments")
          .select("post_id,quantity")
          .eq("cancelled", false).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase
          .from("v_order_processes_with_master")
          .select("post_id,process_order,completed_amount").order("id").range(from, to)),
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
      const payload = mutationPayload("schedules", req.body);
      const department = String(payload.department || "製造G");
      if (!["製造G", "品質管理G", "梱包出荷G"].includes(department)) return res.status(400).json({ error: "部署の指定が正しくありません" });

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("production_schedules")
        .insert({ ...payload, department, created_at: now, updated_at: now })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    return sendMutationError(res, error);
  }
}
