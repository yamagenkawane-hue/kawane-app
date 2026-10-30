import supabase from "../../lib/supabase";
import { Post } from "../type";

export const useDelete = (setShouldFetch: (val: boolean) => void) => {
  const handleDelete = async (postToDelete: Post) => {
    const confirmed = window.confirm("未着手の誤登録・重複登録を取り消します。在庫は減算されません。よろしいですか？");
    if (!confirmed) return;

    if (postToDelete && postToDelete.id) {
      try {
        const { error } = await supabase.rpc("soft_delete_order_post", { p_post_id: postToDelete.id });

        if (error) throw error;

        console.log("データが削除フラグを立てました");
        setShouldFetch(true);
      } catch (error) {
        console.error("削除フラグの更新に失敗しました", error);
        alert(typeof error === "object" && error !== null && "message" in error ? String(error.message) : "取消に失敗しました");
      }
    }
  };

  return { handleDelete };
};
