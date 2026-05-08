"use client";

import React, { useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Manager from "../components/Manager/Manager";
import DeleteIcon from "@mui/icons-material/Delete";
import { User } from "../type";
import { useManager } from "../utills/useManager";

const ManagerMenu = () => {
  const { data, errorMessage, updateUser, deleteUser } = useManager();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedUser, setEditedUser] = useState<Omit<User, "id">>({
    name: "",
    pass: "",
    manager: false,
    delete: false,
  });

  const handleEdit = (user: User) => {
    setEditingUserId(user.id);
    const { id, ...userData } = user;
    setEditedUser(userData);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedUser((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (userId: string) => {
    const success = await updateUser(userId, editedUser);
    if (success) {
      setEditingUserId(null);
    }
  };

  return (
    <div className={styles.managerImg}>
      <Link href="/" className={styles.managerLink}>
        <button className={styles.managerPage}>トップページに戻る</button>
      </Link>
      <div className={styles.center}>
        <h1>ユーザー管理</h1>
      </div>
      <div className={styles.managerDelete}>
        <Link href="managerDelete/">
          <DeleteIcon className={styles.managerDeleteIcon} />
        </Link>
      </div>
      {errorMessage && <p className={styles.managerError}>{errorMessage}</p>}

      <table border={1} className={styles.userList}>
        <tbody>
          <tr className={styles.subTitle}>
            <th>ユーザーID</th>
            <th>パスワード</th>
            <th>管理者</th>
          </tr>
          {data.map((user) => (
            <Manager
              key={user.id}
              user={user}
              editingUserId={editingUserId}
              editedUser={editedUser}
              onEdit={handleEdit}
              onSave={handleSave}
              onCancel={() => setEditingUserId(null)}
              onDelete={() => deleteUser(user.id)}
              onInputChange={handleInputChange}
              onCheckboxChange={() =>
                setEditedUser((prev) => ({ ...prev, manager: !prev.manager }))
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ManagerMenu;
