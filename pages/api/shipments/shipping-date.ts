import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { isCalendarDate } from "@/lib/orderEntry";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth=await requireApiUser(req,res,req.method === "DELETE");
  if(!auth) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const { delivery_date, shipping_offset_days = 0 } = req.body || {};
  if (typeof delivery_date !== "string" || !isCalendarDate(delivery_date)
    || typeof shipping_offset_days !== "number" || !Number.isInteger(shipping_offset_days)
    || shipping_offset_days < 0 || shipping_offset_days > 3650) {
    return res.status(400).json({ error: "実在する納期と0〜3650の整数の前倒し日数を指定してください" });
  }
  try {
    const date = new Date(`${delivery_date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - shipping_offset_days);
    const shippingDate = date.toISOString().slice(0, 10);
    if (!isCalendarDate(shippingDate)) return res.status(400).json({ error: "出荷予定日が有効な日付の範囲を超えています" });
    return res.status(200).json({ shipping_date: shippingDate });
  } catch {
    return res.status(500).json({ error: "出荷予定日を計算できませんでした" });
  }
}
