"use client";

import Link from "next/link";
import styles from "./page.module.css";
import db from "../../../lib/firebase";
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import TableHeader from "../components/TableHeader/TableHeader";
import { Post } from "@/app/type";

const ChildDelete = () => {
  const [posts, setPosts] = useState<Post[]>([]);

  const fetchData = async () => {
    const querySnapshot = await getDocs(collection(db, "posts"));
    setPosts(
      querySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as Post[]
    );
  };

  const handleAction = async (postId: string, action: "restore" | "delete") => {
    const postRef = doc(db, "posts", postId);
    if (action === "restore") await updateDoc(postRef, { delete: false });
    else if (window.confirm("本当に削除しますか？")) await deleteDoc(postRef);
    fetchData();
  };

  const allDelete = async () => {
    if (window.confirm("本当に全て削除しますか？")) {
      await Promise.all(
        posts
          .filter((post) => post.delete)
          .map((post) => deleteDoc(doc(db, "posts", post.id)))
      );
      fetchData();
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const deletedPosts = posts.filter((post) => post.delete === true);

  return (
    <>
      <div className={styles.reservationImg}>
        <Link href="reservation/" className={styles.topPageLink}>
          <button className={styles.topPageButton}>戻る</button>
        </Link>
        <div className={styles.center}>
          <h1>ゴミ箱一覧</h1>
        </div>
        <div className={styles.childAllDelete}>
          <button className={styles.allDelete} onClick={allDelete}>
            全て削除
          </button>
        </div>
      </div>
      <table border={1} className={styles.listTitle}>
        <TableHeader />
        <tbody>
          {deletedPosts.map((post) =>
            post.days.map((day) => (
              <tr key={post.id} className={styles.childDeleteList}>
                <td>{day.name}</td>
                <td>{day.class}</td>
                <td>{day.date}</td>
                <td>{day.startTime}</td>
                <td>{day.endTime}</td>
                <td>{day.realStartTime}</td>
                <td>{day.realEndTime}</td>
                <td>{day.remark}</td>
                <td className={styles.buttonType}>
                  <button
                    className={styles.childDeleteButton}
                    onClick={() => handleAction(post.id, "restore")}
                  >
                    復元
                  </button>
                  <button
                    className={styles.childDelete}
                    onClick={() => handleAction(post.id, "delete")}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
};

export default ChildDelete;
