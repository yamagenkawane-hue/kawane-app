import { requireApiUser } from "@/lib/auth/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { messagingApi } from "@line/bot-sdk";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireApiUser(req, res, true);
  if (!auth) return;
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: "LINE送信機能は未設定です" });
  const { message, userId } = req.body || {};
  if (typeof message !== "string" || !message.trim() || message.length > 5000
    || typeof userId !== "string" || !userId.trim() || userId.length > 256) {
    return res.status(400).json({ error: "送信先と5000文字以内のメッセージを指定してください" });
  }
  try {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
    await client.pushMessage({ to: userId, messages: [{ type: "text", text: message }] });
    return res.status(200).json({ message: "メッセージを送信しました" });
  } catch {
    return res.status(502).json({ error: "LINEへの送信に失敗しました" });
  }
}
