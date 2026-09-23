import type { NextApiRequest, NextApiResponse } from "next";
import { runAiPrediction } from "@/lib/aiPrediction/runner";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "CRON_SECRET is not configured" });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await runAiPrediction("scheduled");
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled prediction failed";
    return res.status(500).json({ error: message });
  }
}
