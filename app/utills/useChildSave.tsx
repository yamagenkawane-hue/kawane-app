import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Day } from "../type";
import db from "../../../lib/firebase";

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
      const postRef = doc(db, "posts", postId);
      const docSnap = await getDoc(postRef);
      if (docSnap.exists()) {
        const days = docSnap.data().days || [];
        days[dayIndex] = { ...days[dayIndex], ...editData };
        await updateDoc(postRef, { days });
        setEditingRow(null);
        setShouldFetch(true);
      }
    } catch (error) {
      console.error("データの更新に失敗しました", error);
    }
  };

  return { handleSave };
};
