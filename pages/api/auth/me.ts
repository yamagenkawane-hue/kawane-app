import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "@/lib/auth/server";
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
  if(req.method!=="GET") {res.setHeader("Allow","GET");return res.status(405).end();}
  const auth=await requireApiUser(req,res);
  if(auth) return res.status(200).json(auth.profile);
}
