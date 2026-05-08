import { useState } from "react";
import { Post } from "../type";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import db from "../../../lib/firebase";

export const useUsersEditPost = (
  filteredPosts: Post[],
  setShouldFetch: (val: boolean) => void
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
    if (editingRow) {
      const postToUpdate = filteredPosts[editingRow.postIndex];
      const postRef = doc(db, "posts", postToUpdate.id);

      try {
        const docSnap = await getDoc(postRef);

        if (docSnap.exists()) {
          const days = docSnap.data().days || [];

          days[editingRow.dayIndex] = {
            ...days[editingRow.dayIndex],
            date: editData.date,
            startTime: editData.startTime,
            endTime: editData.endTime,
            remark: editData.remark,
          };

          await updateDoc(postRef, { days });
          console.log("データが正常に更新されました");

          setEditingRow(null);
          setShouldFetch(true);
        } else {
          console.error("ドキュメントが存在しません");
        }
      } catch (error) {
        console.error("データの更新に失敗しました", error);
      }
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
