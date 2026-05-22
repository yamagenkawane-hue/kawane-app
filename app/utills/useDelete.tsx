import supabase from "../../lib/supabase";
import { Post } from "../type";

export const useDelete = (setShouldFetch: (val: boolean) => void) => {
  const handleDelete = async (postToDelete: Post) => {
    const confirmed = window.confirm("本当に取り消しますか？");
    if (!confirmed) return;

    if (postToDelete && postToDelete.id) {
      try {
        const { error } = await supabase
          .from("posts")
          .update({ delete: true })
          .eq("id", postToDelete.id);

        if (error) throw error;

        console.log("データが削除フラグを立てました");
        setShouldFetch(true);
      } catch (error) {
        console.error("削除フラグの更新に失敗しました", error);
      }
    }
  };

  return { handleDelete };
};
