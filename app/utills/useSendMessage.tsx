import axios from "axios";
import { Day } from "@/app/type";
import { useState } from "react";

export const useSendMessage = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendMessage = async (user: string, days: Day[]) => {
    setIsSubmitting(true);

    try {
      let message = `${days[0].name}さんの予約を\n以下の内容で受け付けました:\n\n`;

      days.forEach((day) => {
        if (day.date && day.date.trim() !== "") {
          message += `日にち ${day.date}:\n`;
          message += `延長開始時間 ${day.startTime}:\n`;
          message += `お迎え時間 ${day.endTime}:\n`;
          message += `備考 ${day.remark}:\n\n`;
        }
      });

      const response = await axios.post("/api/linebot", {
        userId: user,
        message: message,
      });

      if (response.status === 200) {
        console.log("LINEに通知が成功しました:", response.data);
      } else {
        console.error(
          "LINEへの通知に失敗しました:",
          response.status,
          response.statusText
        );
      }
    } catch (error) {
      console.error("LINEへの通知エラー:", error);
    } finally {
      setIsSubmitting(false);
    }

    console.log("メッセージの送信が完了しました");
  };
  return { sendMessage, isSubmitting };
};
