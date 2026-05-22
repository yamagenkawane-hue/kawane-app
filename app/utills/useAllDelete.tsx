import { useState } from "react";
import supabase from "../../lib/supabase";
import { User } from "../type";

export const useAllDelete = (
  posts: User[],
  setShouldFetch: (val: boolean) => void,
) => {
  const [errorMessage, setErrorMessage] = useState("");

  const allDelete = async () => {
    if (confirm("本当に全て削除してもよろしいですか？")) {
      try {
        const ids = posts.map((post) => post.id);

        const { error } = await supabase.from("user").delete().in("id", ids);

        if (error) throw error;

        setShouldFetch(true);
      } catch (error) {
        setErrorMessage("全てのユーザーの削除に失敗しました。");
        console.error("Error deleting all users:", error);
      }
    }
  };

  return { allDelete, errorMessage };
};
