import { doc, updateDoc } from "firebase/firestore";
import db from "../../lib/firebase";
import { Dispatch, SetStateAction } from "react";

export const useReservationDelete = (
  setShouldFetch: Dispatch<
    SetStateAction<boolean>
  >
) => {
  const handleDelete = async (
    postId: string
  ) => {
    if (
      !window.confirm(
        "本当に削除しますか？"
      )
    ) {
      return;
    }

    try {
      await updateDoc(
        doc(db, "posts", postId),
        {
          delete: true,
        }
      );

      setShouldFetch(true);
    } catch (error) {
      console.error(
        "データの削除処理に失敗しました",
        error
      );
    }
  };

  return handleDelete;
};