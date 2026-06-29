import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

const SUBCONTRACTOR_SELECT_COLUMNS =
  "id,name,created_at,updated_at";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("subcontractors")
        .select(SUBCONTRACTOR_SELECT_COLUMNS)
        .order("name", { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "外注先名は必須です" });

      const { data, error } = await supabase
        .from("subcontractors")
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const id = String(req.body?.id || "");
      const name = String(req.body?.name || "").trim();
      if (!id || !name) {
        return res.status(400).json({ error: "IDと外注先名は必須です" });
      }

      const { data, error } = await supabase
        .from("subcontractors")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.body?.id || "");
      if (!id) return res.status(400).json({ error: "IDは必須です" });

      const { error } = await supabase.from("subcontractors").delete().eq("id", id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
