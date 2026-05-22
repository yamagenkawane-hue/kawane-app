import { useState } from "react";
import supabase from "../../lib/supabase";
import { Post } from "../type";

export const useReservationEdit = (
  posts: Post[],
  setShouldFetch: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editingRow, setEditingRow] = useState<{
    postId: string;
    dayIndex: number;
  } | null>(null);

  const handleEdit = (postId: string, dayIndex: number) => {
    const postToEdit = posts.find((post) => post.id === postId);
    if (!postToEdit) {
      console.log("編集対象のIDが見つかりません");
      return;
    }
    const dayToEdit = postToEdit.days[dayIndex];
    setEditStartTime(dayToEdit.realStartTime || "");
    setEditEndTime(dayToEdit.realEndTime || "");
    setEditingRow({ postId, dayIndex });
  };

  const handleSave = async () => {
    if (!editingRow || editEndTime <= editStartTime)
      return alert("開始時間以降の時間に設定してください");

    const { postId, dayIndex } = editingRow;

    try {
      // 現在のdaysを取得
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("days")
        .eq("id", postId)
        .single();

      if (fetchError) throw fetchError;

      const days = data?.days || [];

      if (dayIndex >= 0 && dayIndex < days.length) {
        days[dayIndex] = {
          ...days[dayIndex],
          realStartTime: editStartTime,
          realEndTime: editEndTime,
        };

        const { error: updateError } = await supabase
          .from("posts")
          .update({ days })
          .eq("id", postId);

        if (updateError) throw updateError;

        setEditingRow(null);
        setShouldFetch(true);
      }
    } catch (error) {
      console.error("データの更新に失敗しました", error);
    }
  };

  const handleCancel = () => {
    setEditingRow(null);
  };

  return {
    editStartTime,
    editEndTime,
    editingRow,
    setEditStartTime,
    setEditEndTime,
    handleEdit,
    handleSave,
    handleCancel,
  };
};
