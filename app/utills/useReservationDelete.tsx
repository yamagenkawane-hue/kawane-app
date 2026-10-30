import supabase from "../../lib/supabase";
import { Dispatch, SetStateAction } from "react";

export const useReservationDelete = (
  setShouldFetch: Dispatch<SetStateAction<boolean>>,
) => {
  const handleDelete = async (postId: string) => {
    if (!window.confirm("誤登録・重複登録の注番を取り消します。在庫は減算されません。実績・ロット・引当・出荷履歴のある注番は削除できません。よろしいですか？")) {
      return;
    }

    try {
      const { error } = await supabase.rpc("soft_delete_order_post", { p_post_id: postId });

      if (error) throw error;

      setShouldFetch(true);
    } catch (error) {
      console.error("データの削除処理に失敗しました", error);
      alert(typeof error === "object" && error !== null && "message" in error
        ? String(error.message) : "注番の取消に失敗しました");
    }
  };

  return handleDelete;
};
