import { useState, useEffect } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import db from "../../../lib/firebase";
import { User } from "../type";

export const useManager = () => {
  const [data, setData] = useState<User[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const fetchAllData = async () => {
      const querySnapshot = await getDocs(collection(db, "user"));
      const dataArray = querySnapshot.docs
        .map((doc) => {
          const userData = doc.data() as User;
          const { id, ...rest } = userData;
          return { id: doc.id, ...rest };
        })
        .filter((user) => !user.delete);
      setData(dataArray);
    };
    fetchAllData();
  }, []);

  const updateUser = async (userId: string, editedUser: Omit<User, "id">) => {
    if (!editedUser.name || !editedUser.pass) {
      setErrorMessage("ユーザーIDとパスワードは必須です。");
      return false;
    }
    try {
      await updateDoc(doc(db, "user", userId), { ...editedUser });
      setData((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, ...editedUser } : user
        )
      );
      setErrorMessage("");
      return true;
    } catch (error) {
      console.error("更新中にエラーが発生しました: ", error);
      return false;
    }
  };

  const deleteUser = async (userId: string) => {
    if (confirm("本当に削除してもよろしいですか？")) {
      try {
        await updateDoc(doc(db, "user", userId), { delete: true });
        setData((prev) => prev.filter((user) => user.id !== userId));
      } catch (error) {
        console.error("削除中にエラーが発生しました: ", error);
      }
    }
  };

  return { data, errorMessage, updateUser, deleteUser };
};
