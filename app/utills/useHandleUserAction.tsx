import { useState } from "react";
import supabase from "../../lib/supabase";

export const useHandleUserAction = (setShouldFetch: (val: boolean) => void) => {
  const [errorMessage, setErrorMessage] = useState("");

  const handleUserAction = async (
    userId: string,
    action: "restore" | "delete",
  ) => {
    try {
      if (action === "restore") {
        const { error } = await supabase
          .from("user")
          .update({ delete: false })
          .eq("id", userId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("user").delete().eq("id", userId);

        if (error) throw error;
      }

      setShouldFetch(true);
    } catch (error) {
      setErrorMessage(
        action === "restore"
          ? "ユーザーの復元に失敗しました。"
          : "ユーザーの削除に失敗しました。",
      );
      console.error(
        `Error ${action === "restore" ? "restoring" : "deleting"} user:`,
        error,
      );
    }
  };

  return { handleUserAction, errorMessage };
};
