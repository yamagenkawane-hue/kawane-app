"use client";

import React from "react";
import styles from "./page.module.css";
import { Post } from "../type";
import { useAuthentication } from "../utills/useAuthentication";
import { useFetchPosts } from "../utills/useFetchPosts";
import { useUsersEditPost } from "../utills/useUsersEditPost";
import { useDelete } from "../utills/useDelete";
import UserTableRows from "../components/UserTableRows/UserTableRows";

const UsersPage = () => {
  const { user, name, idToken, loading } = useAuthentication();
  const { posts, setShouldFetch } = useFetchPosts();
  const { handleDelete } = useDelete(setShouldFetch);

  const filteredPosts = posts
    .filter((post) => !post.delete)
    .flatMap((post) => {
      const userDays = post.days.filter(
        (day) =>
          day.userId === user &&
          new Date(day.date).setHours(0, 0, 0, 0) >=
            new Date().setHours(0, 0, 0, 0)
      );
      return userDays.length > 0 ? { ...post, days: userDays } : null;
    })
    .filter(Boolean) as Post[];

  const {
    editingRow,
    editData,
    setEditData,
    handleEdit,
    handleSave,
    setEditingRow,
  } = useUsersEditPost(filteredPosts, setShouldFetch);

  if (idToken === null || loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles.usersImg}>
      <div className={styles.usersCenter}>
        <h1>{name ? `${name}さんの予約一覧` : "予約一覧"}</h1>
      </div>
      <table border={1} className={styles.usersListTitle}>
        <tr className={styles.usersSubTitle}>
          <th>園児名</th>
          <th>クラス</th>
          <th>日にち</th>
          <th>延長開始時間</th>
          <th>お迎え時間</th>
          <th>備考</th>
        </tr>
        <UserTableRows
          filteredPosts={filteredPosts}
          editingRow={editingRow}
          editData={editData}
          setEditData={setEditData}
          handleEdit={handleEdit}
          handleSave={handleSave}
          handleDelete={handleDelete}
          setEditingRow={setEditingRow}
        />
      </table>
    </div>
  );
};

export default UsersPage;
