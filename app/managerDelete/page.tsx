"use client";

import React, { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import Link from "next/link";
import styles from "./page.module.css";
import { User } from "../type";
import { useAllDelete } from "../utills/useAllDelete";
import { useHandleUserAction } from "../utills/useHandleUserAction";

const USER_SELECT_COLUMNS = "id,name,pass,manager,delete";

const ManagerDelete = () => {
  const [posts, setPosts] = useState<User[]>([]);
  const [shouldFetch, setShouldFetch] = useState(true);
  const { handleUserAction, errorMessage: actionErrorMessage } =
    useHandleUserAction(setShouldFetch);
  const { allDelete, errorMessage: allDeleteErrorMessage } = useAllDelete(
    posts,
    setShouldFetch,
  );

  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetch) return;

      try {
        const { data, error } = await supabase
          .from("user")
          .select(USER_SELECT_COLUMNS)
          .eq("delete", true);

        if (error) throw error;

        const postsArray: User[] = (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          pass: row.pass,
          manager: row.manager,
          delete: row.delete,
        }));

        setPosts(postsArray);
        setShouldFetch(false);
      } catch (error) {
        console.error("Error fetching posts:", error);
      }
    };

    fetchData();
  }, [shouldFetch]);

  return (
    <div className={styles.managerImg}>
      <Link href="managerMenu/" className={styles.managerLink}>
        <button className={styles.managerPage}>戻る</button>
      </Link>
      <div className={styles.center}>
        <h1>ゴミ箱一覧</h1>
      </div>
      <div className={styles.managerDelete}></div>
      <div className={styles.managerAllDelete}>
        <button className={styles.allDelete} onClick={allDelete}>
          全て削除
        </button>
      </div>
      {actionErrorMessage && (
        <p className={styles.managerError}>{actionErrorMessage}</p>
      )}
      {allDeleteErrorMessage && (
        <p className={styles.managerError}>{allDeleteErrorMessage}</p>
      )}
      <table border={1} className={styles.userList}>
        <thead>
          <tr className={styles.subTitle}>
            <th>ユーザーID</th>
            <th>パスワード</th>
            <th>管理者</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className={styles.managerDeleteText}>
              <td>{post.name}</td>
              <td>{post.pass}</td>
              <td>{post.manager ? "はい" : "いいえ"}</td>
              <td className={styles.restore}>
                <button
                  className={styles.restoreButton}
                  onClick={() => handleUserAction(post.id, "restore")}
                >
                  復元
                </button>
                <button
                  className={styles.managerDeleteButton}
                  onClick={() => handleUserAction(post.id, "delete")}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ManagerDelete;
