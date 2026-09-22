import type { NextApiRequest, NextApiResponse } from "next";
import { runAiPrediction } from "@/lib/aiPrediction/runner";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const result = await runAiPrediction("manual");
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI予測の実行に失敗しました。";
    return res.status(500).json({ error: message });
  }
}
