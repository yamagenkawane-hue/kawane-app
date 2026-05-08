"use client";

import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import db from "../../../lib/firebase";
import Link from "next/link";
import styles from "./page.module.css";
import { User } from "../type";
import { useAllDelete } from "../utills/useAllDelete";
import { useHandleUserAction } from "../utills/useHandleUserAction";

const ManagerDelete = () => {
  const [posts, setPosts] = useState<User[]>([]);
  const [shouldFetch, setShouldFetch] = useState(true);
  const { handleUserAction, errorMessage: actionErrorMessage } =
    useHandleUserAction(setShouldFetch);
  const { allDelete, errorMessage: allDeleteErrorMessage } = useAllDelete(
    posts,
    setShouldFetch
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const postData = collection(db, "user");
        const querySnapshot = await getDocs(postData);
        const postsArray = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return { ...data, id: doc.id } as User;
        });

        const filteredPosts = postsArray.filter((post) => post.delete);
        setPosts(filteredPosts);
      } catch (error) {
        console.error("Error fetching posts:", error);
      }
    };
    if (shouldFetch) {
      fetchData();
      setShouldFetch(false);
    }
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
              <td>{post.pass}</td> <td>{post.manager ? "はい" : "いいえ"}</td>{" "}
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
