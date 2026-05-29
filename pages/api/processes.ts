import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("process_master")
        .select("*")
        .order("sort", { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { data, error } = await supabase
        .from("process_master")
        .insert(req.body)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const { id, ...payload } = req.body;
      const { data, error } = await supabase
        .from("process_master")
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
        .from("process_master")
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
