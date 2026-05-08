import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import db from "../../../lib/firebase";

export const useReservationEdit = (posts: any[], setShouldFetch: any) => {
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
      const postRef = doc(db, "posts", postId);
      const docSnap = await getDoc(postRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const days = data.days || [];
        if (dayIndex >= 0 && dayIndex < days.length) {
          days[dayIndex] = {
            ...days[dayIndex],
            realStartTime: editStartTime,
            realEndTime: editEndTime,
          };
          await updateDoc(postRef, { days });
          setEditingRow(null);
          setShouldFetch(true);
        }
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
