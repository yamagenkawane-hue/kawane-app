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
    const status = Number((error as { status?: number })?.status || 0);
    const message =
      status === 429
        ? "API利用上限に達したため、今回の予測は更新できませんでした。翌朝の定期更新で再実行します。"
        : status === 503
          ? "Geminiが一時的に混雑しているため、今回の予測は更新できませんでした。翌朝の定期更新で再実行します。"
          : "予測の更新に失敗しました。翌朝の定期更新で再実行します。";
    return res.status(status === 429 || status === 503 ? status : 500).json({ error: message });
  }
}
