"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";

import { useEffect, useState, useCallback } from "react";

import Link from "next/link";

import { Pencil, Trash2, RotateCcw, User, Shield } from "lucide-react";

import db from "@/lib/firebase";

import styles from "./page.module.css";

import { User as UserType } from "../type";

export default function UserManagerPage() {
  const [users, setUsers] = useState<UserType[]>([]);

  const [trashUsers, setTrashUsers] = useState<UserType[]>([]);

  const [editingUser, setEditingUser] = useState<UserType | null>(null);

  const [editName, setEditName] = useState("");

  const [editPass, setEditPass] = useState("");

  const [loading, setLoading] = useState(true);

  // =========================
  // Fetch
  // =========================

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      const snap = await getDocs(collection(db, "user"));

      const data = snap.docs.map((doc) => ({
        ...(doc.data() as Omit<UserType, "id">),
        id: doc.id,
      }));

      const activeUsers = data.filter((item) => !item.delete);

      const deletedUsers = data.filter((item) => item.delete);

      setUsers(activeUsers);

      setTrashUsers(deletedUsers);
    } catch (error) {
      console.error("ユーザー取得エラー", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // =========================
  // Init
  // =========================

  useEffect(() => {
    const init = async () => {
      await fetchUsers();
    };

    init();
  }, [fetchUsers]);

  // =========================
  // Edit Start
  // =========================

  const startEdit = (user: UserType) => {
    setEditingUser(user);

    setEditName(user.name);

    setEditPass(user.pass);
  };

  // =========================
  // Save Edit
  // =========================

  const saveEdit = async () => {
    if (!editingUser) return;

    try {
      await updateDoc(doc(db, "user", editingUser.id), {
        name: editName,
        pass: editPass,
      });

      setEditingUser(null);

      setEditName("");

      setEditPass("");

      await fetchUsers();
    } catch (error) {
      console.error("更新エラー", error);
    }
  };

  // =========================
  // Move Trash
  // =========================

  const moveTrash = async (id: string) => {
    try {
      await updateDoc(doc(db, "user", id), {
        delete: true,
      });

      await fetchUsers();
    } catch (error) {
      console.error("削除エラー", error);
    }
  };

  // =========================
  // Restore
  // =========================

  const restoreUser = async (id: string) => {
    try {
      await updateDoc(doc(db, "user", id), {
        delete: false,
      });

      await fetchUsers();
    } catch (error) {
      console.error("復元エラー", error);
    }
  };

  // =========================
  // Full Delete
  // =========================

  const fullDelete = async (id: string) => {
    const confirmDelete = window.confirm(
      "完全削除しますか？\nこの操作は元に戻せません。",
    );

    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "user", id));

      await fetchUsers();
    } catch (error) {
      console.error("完全削除エラー", error);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/settings" className={styles.backButton}>
          ← Settingsへ戻る
        </Link>

        <div>
          <p className={styles.subTitle}>Yamagen System</p>

          <h1 className={styles.title}>ユーザー管理</h1>
        </div>
      </div>

      {/* Loading */}
      {loading && <div className={styles.loading}>Loading...</div>}

      {/* User List */}
      {!loading && (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>有効ユーザー</h2>

            <div className={styles.grid}>
              {users.map((user) => (
                <div key={user.id} className={styles.card}>
                  <div className={styles.iconArea}>
                    {user.manager ? <Shield size={32} /> : <User size={32} />}
                  </div>

                  <div className={styles.cardBody}>
                    <h3>{user.name}</h3>

                    <p>パスワード :{user.pass}</p>

                    <p>権限 :{user.manager ? "管理者" : "一般"}</p>
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.editButton}
                      onClick={() => startEdit(user)}
                    >
                      <Pencil size={18} />
                    </button>

                    <button
                      className={styles.deleteButton}
                      onClick={() => moveTrash(user.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trash */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>ゴミ箱</h2>

            <div className={styles.grid}>
              {trashUsers.map((user) => (
                <div key={user.id} className={styles.card}>
                  <div className={styles.iconArea}>
                    <Trash2 size={32} />
                  </div>

                  <div className={styles.cardBody}>
                    <h3>{user.name}</h3>

                    <p>パスワード :{user.pass}</p>
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.restoreButton}
                      onClick={() => restoreUser(user.id)}
                    >
                      <RotateCcw size={18} />
                    </button>

                    <button
                      className={styles.deleteButton}
                      onClick={() => fullDelete(user.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <h2>ユーザー編集</h2>

            <input
              className={styles.input}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="ユーザー名"
            />

            <input
              className={styles.input}
              value={editPass}
              onChange={(e) => setEditPass(e.target.value)}
              placeholder="パスワード"
            />

            <div className={styles.modalActions}>
              <button className={styles.saveButton} onClick={saveEdit}>
                保存
              </button>

              <button
                className={styles.cancelButton}
                onClick={() => {
                  setEditingUser(null);

                  setEditName("");

                  setEditPass("");
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
