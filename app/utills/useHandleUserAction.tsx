import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import db from "../../../lib/firebase";
import { useState } from "react";

export const useHandleUserAction = (setShouldFetch: (val: boolean) => void) => {
  const [errorMessage, setErrorMessage] = useState("");

  const handleUserAction = async (
    userId: string,
    action: "restore" | "delete"
  ) => {
    try {
      const userDoc = doc(db, "user", userId);
      if (action === "restore") {
        await updateDoc(userDoc, { delete: false });
      } else {
        await deleteDoc(userDoc);
      }

      setShouldFetch(true);
    } catch (error) {
      setErrorMessage(
        action === "restore"
          ? "ユーザーの復元に失敗しました。"
          : "ユーザーの削除に失敗しました。"
      );
      console.error(
        `Error ${action === "restore" ? "restoring" : "deleting"} user:`,
        error
      );
    }
  };

  return { handleUserAction, errorMessage };
};
