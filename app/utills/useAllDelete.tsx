import { deleteDoc, doc } from "firebase/firestore";
import { useState } from "react";
import db from "../../../lib/firebase";
import { User } from "../type";

export const useAllDelete = (
  posts: User[],
  setShouldFetch: (val: boolean) => void
) => {
  const [errorMessage, setErrorMessage] = useState("");

  const allDelete = async () => {
    if (confirm("本当に全て削除してもよろしいですか？")) {
      try {
        await Promise.all(
          posts.map((post) => deleteDoc(doc(db, "user", post.id)))
        );
        setShouldFetch(true);
      } catch (error) {
        setErrorMessage("全てのユーザーの削除に失敗しました。");
        console.error("Error deleting all users:", error);
      }
    }
  };
  return { allDelete, errorMessage };
};
