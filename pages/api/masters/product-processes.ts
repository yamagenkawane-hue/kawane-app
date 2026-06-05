import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const productCode = String(req.query.product_code || "");
      let query = supabase
        .from("product_processes")
        .select("*, subcontractors(name)")
        .order("product_code", { ascending: true })
        .order("process_order", { ascending: true });

      if (productCode) query = query.eq("product_code", productCode);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const productCode = String(req.body?.product_code || "").trim();
      const processName = String(req.body?.process_name || "").trim();
      const processOrder = Number(req.body?.process_order);

      if (!productCode || !processName || !Number.isFinite(processOrder)) {
        return res.status(400).json({ error: "品番、工程名、工程順は必須です" });
      }

      const { data, error } = await supabase
        .from("product_processes")
        .insert({
          product_code: productCode,
          process_name: processName,
          process_order: processOrder,
          subcontractor_id: req.body?.subcontractor_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ error: "IDは必須です" });

      const { data, error } = await supabase
        .from("product_processes")
        .update({
          product_code: req.body?.product_code,
          process_name: req.body?.process_name,
          process_order: Number(req.body?.process_order),
          subcontractor_id: req.body?.subcontractor_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.body?.id || "");
      if (!id) return res.status(400).json({ error: "IDは必須です" });

      const { error } = await supabase.from("product_processes").delete().eq("id", id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
