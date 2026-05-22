import { useState } from "react";
import { Post } from "../type";
import supabase from "../../lib/supabase";

export const useUsersEditPost = (
  filteredPosts: Post[],
  setShouldFetch: (val: boolean) => void,
) => {
  const [editData, setEditData] = useState({
    date: "",
    startTime: "",
    endTime: "",
    remark: "",
  });
  const [editingRow, setEditingRow] = useState<{
    postIndex: number;
    dayIndex: number;
  } | null>(null);

  const handleEdit = (postIndex: number, dayIndex: number) => {
    const dayToEdit = filteredPosts[postIndex].days[dayIndex];
    if (dayToEdit)
      setEditData({
        date: dayToEdit.date || "",
        startTime: dayToEdit.startTime || "",
        endTime: dayToEdit.endTime || "",
        remark: dayToEdit.remark || "",
      });
    setEditingRow({ postIndex, dayIndex });
  };

  const handleSave = async () => {
    if (!editingRow) return;

    const postToUpdate = filteredPosts[editingRow.postIndex];

    try {
      // 現在のdaysを取得
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("days")
        .eq("id", postToUpdate.id)
        .single();

      if (fetchError) throw fetchError;

      const days = data?.days || [];

      days[editingRow.dayIndex] = {
        ...days[editingRow.dayIndex],
        date: editData.date,
        startTime: editData.startTime,
        endTime: editData.endTime,
        remark: editData.remark,
      };

      const { error: updateError } = await supabase
        .from("posts")
        .update({ days })
        .eq("id", postToUpdate.id);

      if (updateError) throw updateError;

      console.log("データが正常に更新されました");
      setEditingRow(null);
      setShouldFetch(true);
    } catch (error) {
      console.error("データの更新に失敗しました", error);
    }
  };

  return {
    editingRow,
    editData,
    setEditData,
    handleEdit,
    handleSave,
    setEditingRow,
  };
};
