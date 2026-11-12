import type { NextApiResponse } from "next";
import { isCalendarDate } from "@/lib/orderEntry";

export class ApiInputError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rule = "text" | "uuid" | "date" | "boolean" | "quantity" | "positive";
const definitions: Record<string, { required: string[]; fields: Record<string, Rule> }> = {
  results: { required: ["post_id", "order_process_id", "date", "amount", "process_name"], fields: {
    post_id: "uuid", schedule_id: "uuid", order_process_id: "uuid", lot_id: "uuid", process_id: "text", process_name: "text", date: "date", amount: "positive",
  } },
  lots: { required: ["lot_no", "product_name", "customer_name", "quantity"], fields: {
    post_id: "uuid", product_id: "uuid", customer_id: "uuid", order_no: "text", product_code: "text", product_name: "text", customer_name: "text",
    lot_no: "text", material_lot_no: "text", lot_type: "text", quantity: "quantity", status: "text", note: "text",
  } },
  processes: { required: ["process_id", "name"], fields: { process_id: "text", name: "text", sort: "quantity", enabled: "boolean", outsourcing: "boolean" } },
  schedules: { required: ["customer_name", "product_name", "press_number", "plan_amount"], fields: {
    post_id: "uuid", product_id: "uuid", customer_id: "uuid", order_no: "text", customer_name: "text", product_name: "text", press_number: "text", lot_no: "text",
    department: "text", plan_amount: "quantity", press_completed_amount: "quantity", press_completed_date: "date", planned_start_date: "date",
    shipping_scheduled_start: "date", shipping_scheduled_end: "date",
  } },
};

export function mutationId(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw new ApiInputError("有効なIDを指定してください");
  return value;
}

export function mutationPayload(kind: keyof typeof definitions, input: unknown, update = false): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiInputError("入力内容をオブジェクトで指定してください");
  const body = input as Record<string, unknown>, definition = definitions[kind];
  const result: Record<string, unknown> = {};
  if (update) result.id = mutationId(body.id);
  for (const [field, value] of Object.entries(body)) {
    if (field === "id" && update) continue;
    const rule = definition.fields[field];
    if (!rule) throw new ApiInputError(`更新できない項目です: ${field}`);
    if (value === null && !definition.required.includes(field) && (rule === "uuid" || rule === "date")) { result[field] = null; continue; }
    if (rule === "text") {
      if (typeof value !== "string" || value.length > 2000 || (definition.required.includes(field) && !value.trim())) throw new ApiInputError(`${field}を正しく入力してください`);
    } else if (rule === "uuid") mutationId(value);
    else if (rule === "date") {
      if (typeof value !== "string" || !isCalendarDate(value)) throw new ApiInputError(`${field}は実在する日付で指定してください`);
    } else if (rule === "boolean") {
      if (typeof value !== "boolean") throw new ApiInputError(`${field}は真偽値で指定してください`);
    } else if (typeof value !== "number" || !Number.isInteger(value) || value < (rule === "positive" ? 1 : 0) || value > 2147483647) {
      throw new ApiInputError(`${field}は範囲内の整数で指定してください`);
    }
    result[field] = value;
  }
  if (!update && definition.required.some((field) => !(field in result))) throw new ApiInputError("必須項目が不足しています");
  if (update && Object.keys(result).length === 1) throw new ApiInputError("変更する項目を指定してください");
  if (result.lot_type && !["normal", "trial", "advance"].includes(String(result.lot_type))) throw new ApiInputError("ロット区分が不正です");
  return result;
}

export function sendMutationError(res: NextApiResponse, error: unknown) {
  if (error instanceof ApiInputError) return res.status(400).json({ error: error.message });
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "42501") return res.status(403).json({ error: "この操作を行う権限がありません" });
  if (code.startsWith("22") || code === "23502") return res.status(400).json({ error: "入力内容を確認してください" });
  if (code.startsWith("23") || code === "P0001") return res.status(409).json({ error: "関連データまたは現在の状態と一致しません" });
  if (code === "PGRST116") return res.status(404).json({ error: "対象データが見つかりません" });
  return res.status(500).json({ error: "処理に失敗しました。時間をおいて再実行してください" });
}
