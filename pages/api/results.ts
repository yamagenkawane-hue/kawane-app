import { mutationId, mutationPayload, sendMutationError } from "@/lib/apiMutationValidation";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";


const RESULT_SELECT_COLUMNS =
  "id,post_id,schedule_id,order_process_id,process_name,date,amount,created_at";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth=await requireApiUser(req,res,req.method === "DELETE");
  if(!auth) return;
  const supabase=auth.client;

  try {
    if (req.method === "GET") {
      const { data, error } = await fetchAllRows((from, to) => supabase
        .from("v_production_results_with_master")
        .select(RESULT_SELECT_COLUMNS)
        .order("created_at", { ascending: false }).order("id").range(from, to));
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { data, error } = await supabase
        .from("production_results")
        .insert(mutationPayload("results", req.body))
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const { id, ...payload } = mutationPayload("results", req.body, true);
      const { data, error } = await supabase
        .from("production_results")
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
        .from("production_results")
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
