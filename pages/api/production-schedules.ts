import { fetchAllRows } from "@/lib/fetchAllRows";
import { mutationId, mutationPayload, sendMutationError } from "@/lib/apiMutationValidation";
import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";


const SCHEDULE_SELECT_COLUMNS =
  "id,post_id,order_no,customer_name,product_name,press_number,lot_no,planned_start_date,plan_amount,press_completed_amount,press_completed_date,shipping_scheduled_start,shipping_scheduled_end,delivery_date,created_at,updated_at,department";

const POST_SELECT_COLUMNS = "id,delete,order_no,order_amount";

const DEPARTMENTS = ["製造G", "品質管理G", "梱包出荷G"] as const;

const isDepartment = (value: string) =>
  DEPARTMENTS.some((department) => department === value);

const normalizeDepartment = (value: unknown) => String(value || "製造G");

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
      const departmentQuery =
        typeof req.query.department === "string" ? req.query.department : "";

      if (departmentQuery && !isDepartment(departmentQuery)) {
        return res.status(400).json({ error: "部署の指定が正しくありません" });
      }

      const [scheduleResult, postResult, shipmentResult, processResult] = await Promise.all([
        fetchAllRows((from, to) => {
          const query = supabase.from("v_production_schedules_with_master").select(SCHEDULE_SELECT_COLUMNS);
          return (departmentQuery ? query.eq("department", departmentQuery) : query)
            .order("created_at", { ascending: false }).order("id").range(from, to);
        }),
        fetchAllRows((from, to) => supabase.from("v_posts_with_master").select(POST_SELECT_COLUMNS)
          .is("shipment_closed_at", null).or("delete.is.null,delete.eq.false").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("shipments").select("post_id,quantity")
          .eq("cancelled", false).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("v_order_processes_with_master")
          .select("post_id,process_order,completed_amount").order("id").range(from, to)),
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
      const payload = mutationPayload("schedules", req.body);
      const department = normalizeDepartment(payload.department);

      if (!isDepartment(department)) {
        return res.status(400).json({ error: "部署の指定が正しくありません" });
      }

      const { data, error } = await supabase
        .from("production_schedules")
        .insert({ ...payload, department })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const { id, ...payload } = mutationPayload("schedules", req.body, true);

      if (!id) {
        return res.status(400).json({ error: "IDが不足しています" });
      }

      const updatePayload = { ...payload };
      if (Object.prototype.hasOwnProperty.call(updatePayload, "department")) {
        const department = normalizeDepartment(updatePayload.department);

        if (!isDepartment(department)) {
          return res.status(400).json({ error: "部署の指定が正しくありません" });
        }

        updatePayload.department = department;
      }

      const { data, error } = await supabase
        .from("production_schedules")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const id = mutationId(req.query?.id || req.body?.id);
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
    return sendMutationError(res, error);
  }
}
