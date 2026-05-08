import { doc, updateDoc } from "firebase/firestore";
import db from "../../../lib/firebase";
import { Post } from "../type";
import { Dispatch, SetStateAction } from "react";

export const useReservationDelete = (
  setShouldFetch: Dispatch<SetStateAction<boolean>>
) => {
  const handleDelete = async (postIndex: number, filteredPosts: Post[]) => {
    const postToDelete = filteredPosts[postIndex];
    if (postToDelete?.id && window.confirm("本当に削除しますか？")) {
      try {
        await updateDoc(doc(db, "posts", postToDelete.id), { delete: true });
        setShouldFetch(true);
      } catch (error) {
        console.error("データの削除処理に失敗しました", error);
      }
    }
  };
  return handleDelete;
};
