import { useState, useEffect } from "react";
import supabase from "../../lib/supabase";
import { User } from "../type";

const USER_SELECT_COLUMNS = "id,name,pass,manager,delete";

export const useManager = () => {
  const [data, setData] = useState<User[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const { data: rows, error } = await supabase
          .from("user")
          .select(USER_SELECT_COLUMNS)
          .eq("delete", false);

        if (error) throw error;

        const dataArray: User[] = (rows || []).map((row) => ({
          id: row.id,
          name: row.name,
          pass: row.pass,
          manager: row.manager,
          delete: row.delete,
        }));

        setData(dataArray);
      } catch (error) {
        console.error("データ取得エラー", error);
      }
    };

    fetchAllData();
  }, []);

  const updateUser = async (userId: string, editedUser: Omit<User, "id">) => {
    if (!editedUser.name || !editedUser.pass) {
      setErrorMessage("ユーザーIDとパスワードは必須です。");
      return false;
    }

    try {
      const { error } = await supabase
        .from("user")
        .update({
          name: editedUser.name,
          pass: editedUser.pass,
          manager: editedUser.manager,
          delete: editedUser.delete,
        })
        .eq("id", userId);

      if (error) throw error;

      setData((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, ...editedUser } : user,
        ),
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
        const { error } = await supabase
          .from("user")
          .update({ delete: true })
          .eq("id", userId);

        if (error) throw error;

        setData((prev) => prev.filter((user) => user.id !== userId));
      } catch (error) {
        console.error("削除中にエラーが発生しました: ", error);
      }
    }
  };

  return { data, errorMessage, updateUser, deleteUser };
};
