import supabase from "../../lib/supabase";
import { Dispatch, SetStateAction } from "react";

export const useReservationDelete = (
  setShouldFetch: Dispatch<SetStateAction<boolean>>,
) => {
  const handleDelete = async (postId: string) => {
    if (!window.confirm("本当に削除しますか？")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("posts")
        .update({ delete: true })
        .eq("id", postId);

      if (error) throw error;

      setShouldFetch(true);
    } catch (error) {
      console.error("データの削除処理に失敗しました", error);
    }
  };

  return handleDelete;
};
