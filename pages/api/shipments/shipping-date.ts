import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { subDays } from "date-fns";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth=await requireApiUser(req,res,req.method === "DELETE");
  if(!auth) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const { delivery_date, shipping_offset_days } = req.body || {};
  if (!delivery_date || Number(shipping_offset_days) < 0) {
    return res.status(400).json({ error: "納期と出荷日前倒し日数を指定してください" });
  }

  const shippingDate = subDays(
    new Date(delivery_date),
    Number(shipping_offset_days || 0),
  )
    .toISOString()
    .slice(0, 10);

  return res.status(200).json({ shipping_date: shippingDate });
}
