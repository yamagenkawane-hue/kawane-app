"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw, User, Shield, Lock } from "lucide-react"; // Lock追加
import supabase from "@/lib/supabase";
import styles from "./page.module.css";
import { User as UserType } from "../type";

const USER_SELECT_COLUMNS = "id,name,pass,manager,delete";

export default function UserManagerPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [trashUsers, setTrashUsers] = useState<UserType[]>([]);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editName, setEditName] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editManager, setEditManager] = useState(false);
  const [loading, setLoading] = useState(true);

  const managerName = process.env.NEXT_PUBLIC_MANAGER_ID;
  const managerPass = process.env.NEXT_PUBLIC_MANAGER_PASSWORD;

  const isLocked = (user: UserType) =>
    user.name === managerName && user.pass === managerPass;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("user")
        .select(USER_SELECT_COLUMNS);

      if (error) throw error;

      const mapped: UserType[] = (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        pass: row.pass,
        manager: row.manager,
        delete: row.delete,
      }));

      setUsers(mapped.filter((item) => !item.delete));
      setTrashUsers(mapped.filter((item) => item.delete));
    } catch (error) {
      console.error("ユーザー取得エラー", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchUsers();
    };
    init();
  }, [fetchUsers]);

  const startEdit = (user: UserType) => {
    if (isLocked(user)) return; // ロック時は何もしない
    setEditingUser(user);
    setEditName(user.name);
    setEditPass(user.pass);
    setEditManager(user.manager);
  };

  const saveEdit = async () => {
    if (!editingUser) return;

    try {
      const { error } = await supabase
        .from("user")
        .update({ name: editName, pass: editPass, manager: editManager })
        .eq("id", editingUser.id);

      if (error) throw error;

      setEditingUser(null);
      setEditName("");
      setEditPass("");
      setEditManager(false);

      await fetchUsers();
    } catch (error) {
      console.error("更新エラー", error);
    }
  };

  const moveTrash = async (user: UserType) => {
    if (isLocked(user)) return;
    try {
      const { error } = await supabase
        .from("user")
        .update({ delete: true })
        .eq("id", user.id);

      if (error) throw error;

      await fetchUsers();
    } catch (error) {
      console.error("削除エラー", error);
    }
  };

  const restoreUser = async (id: string) => {
    try {
      const { error } = await supabase
        .from("user")
        .update({ delete: false })
        .eq("id", id);

      if (error) throw error;

      await fetchUsers();
    } catch (error) {
      console.error("復元エラー", error);
    }
  };

  const fullDelete = async (id: string) => {
    const confirmDelete = window.confirm(
      "完全削除しますか？\nこの操作は元に戻せません。",
    );
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from("user").delete().eq("id", id);

      if (error) throw error;

      await fetchUsers();
    } catch (error) {
      console.error("完全削除エラー", error);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/settings" className={styles.backButton}>
          ← システム設定へ戻る
        </Link>

        <div>
          <p className={styles.subTitle}>Yamagen System</p>
          <h1 className={styles.title}>ユーザー管理</h1>
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading...</div>}

      {!loading && (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>有効ユーザー</h2>

            <div className={styles.grid}>
              {users.map((user) => (
                <div key={user.id} className={styles.card}>
                  <div className={styles.iconArea}>
                    {isLocked(user) ? (
                      <Lock size={32} /> // ロックユーザーはLockアイコンを表示
                    ) : user.manager ? (
                      <Shield size={32} />
                    ) : (
                      <User size={32} />
                    )}
                  </div>

                  <div className={styles.cardBody}>
                    <h3>{user.name}</h3>
                    <p>パスワード :{user.pass}</p>
                    <p>権限 :{user.manager ? "管理者" : "一般"}</p>
                    {isLocked(user) && (
                      <p style={{ color: "gray", fontSize: "0.8rem" }}>
                        🔒 このユーザーは編集・削除できません
                      </p>
                    )}
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.editButton}
                      onClick={() => startEdit(user)}
                      disabled={isLocked(user)}
                      title={
                        isLocked(user) ? "このユーザーは編集できません" : "編集"
                      }
                      style={
                        isLocked(user)
                          ? { opacity: 0.3, cursor: "not-allowed" }
                          : {}
                      }
                    >
                      <Pencil size={18} />
                    </button>

                    <button
                      className={styles.deleteButton}
                      onClick={() => moveTrash(user)}
                      disabled={isLocked(user)}
                      title={
                        isLocked(user) ? "このユーザーは削除できません" : "削除"
                      }
                      style={
                        isLocked(user)
                          ? { opacity: 0.3, cursor: "not-allowed" }
                          : {}
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

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

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={editManager}
                onChange={(e) => setEditManager(e.target.checked)}
              />
              管理者権限
            </label>

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
                  setEditManager(false);
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
