import { mutationId, mutationPayload, sendMutationError } from "@/lib/apiMutationValidation";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";


const PROCESS_SELECT_COLUMNS =
  "id,process_id,name,sort,enabled,outsourcing";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth=await requireApiUser(req,res,req.method !== "GET");
  if(!auth) return;
  const supabase=auth.client;

  try {
    if (req.method === "GET") {
      const { data, error } = await fetchAllRows((from, to) => supabase
        .from("process_master")
        .select(PROCESS_SELECT_COLUMNS)
        .order("sort", { ascending: true }).order("id").range(from, to));
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { data, error } = await supabase
        .from("process_master")
        .insert(mutationPayload("processes", req.body))
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const { id, ...payload } = mutationPayload("processes", req.body, true);
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
      const id = mutationId(req.query?.id || req.body?.id);
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
    return sendMutationError(res, error);
  }
}
