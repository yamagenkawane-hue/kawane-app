import supabase from "../../lib/supabase";
import { Day } from "../type";

type UseSaveEditProps = {
  editData: Day | null;
  editingRow: { postId: string; dayIndex: number } | null;
  setEditingRow: (value: null) => void;
  setShouldFetch: (value: boolean) => void;
};

export const useChildSave = ({
  editData,
  editingRow,
  setEditingRow,
  setShouldFetch,
}: UseSaveEditProps) => {
  const handleSave = async () => {
    if (!editingRow || !editData) return;

    if (editData.endTime <= editData.startTime) {
      alert("開始時間以降の時間に設定してください");
      return;
    }

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
      days[dayIndex] = { ...days[dayIndex], ...editData };

      const { error: updateError } = await supabase
        .from("posts")
        .update({ days })
        .eq("id", postId);

      if (updateError) throw updateError;

      setEditingRow(null);
      setShouldFetch(true);
    } catch (error) {
      console.error("データの更新に失敗しました", error);
    }
  };

  return { handleSave };
};
