"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw, User, Shield, Lock } from "lucide-react"; // Lock追加
import { authFetch } from "@/lib/auth/client";
import { useAppAuth } from "@/app/components/AuthProvider/AuthProvider";
import styles from "./page.module.css";
import { User as UserType } from "../type";


export default function UserManagerPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [trashUsers, setTrashUsers] = useState<UserType[]>([]);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editName, setEditName] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editManager, setEditManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editDisplayName, setEditDisplayName] = useState("");

  const {profile,refresh}=useAppAuth();
  const isLocked=(user:UserType)=>user.id===profile?.id;
  const updateAccount=async(values:Record<string,unknown>)=>{
    const response=await authFetch("/api/auth/users",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});
    if(!response.ok) {const result=await response.json();throw new Error(result.error);}
  };
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      const response=await authFetch("/api/auth/users");
      if(!response.ok) throw new Error("ユーザー情報を取得できません");
      const data=await response.json() as {id:string;login_id:string;display_name:string;manager:boolean;active:boolean}[];
      const mapped:UserType[]=data.map(row=>({id:row.id,name:row.login_id,displayName:row.display_name||"",pass:"",manager:row.manager,delete:!row.active}));
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
    setEditingUser(user);
    setEditName(user.name);
    setEditDisplayName(user.displayName || "");
    setEditPass("");
    setEditManager(user.manager);
  };

  const saveEdit = async () => {
    if (!editingUser) return;

    try {
      await updateAccount(isLocked(editingUser) ? {id:editingUser.id,display_name:editDisplayName}
        : {id:editingUser.id,name:editName,display_name:editDisplayName,password:editPass,manager:editManager});
      if (isLocked(editingUser)) await refresh();
      setEditingUser(null);
      setEditName("");
      setEditPass("");
      setEditManager(false);

      await fetchUsers();
    } catch (error) {
      alert(error instanceof Error?error.message:"更新できません");
    }
  };

  const moveTrash = async (user: UserType) => {
    if (isLocked(user)) return;
    try {
      await updateAccount({id:user.id,active:false});
      await fetchUsers();
    } catch (error) {
      alert(error instanceof Error?error.message:"無効化できません");
    }
  };

  const restoreUser = async (id: string) => {
    try {
      await updateAccount({id,active:true});
      await fetchUsers();
    } catch (error) {
      alert(error instanceof Error?error.message:"復元できません");
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
                    <h3>{user.displayName || user.name}</h3>
                    <p>ログインID：{user.name}</p>
                    <p>パスワード：非表示</p>
                    <p>権限 :{user.manager ? "管理者" : "一般"}</p>
                    {isLocked(user) && (
                      <p style={{ color: "gray", fontSize: "0.8rem" }}>
                        🔒 ログイン中は表示名のみ変更できます
                      </p>
                    )}
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.editButton}
                      onClick={() => startEdit(user)}
                      title={isLocked(user) ? "表示名を編集" : "編集"}
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
                    <h3>{user.displayName || user.name}</h3>
                    <p>ログインID：{user.name}</p>
                    <p>パスワード：非表示</p>
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.restoreButton}
                      onClick={() => restoreUser(user.id)}
                    >
                      <RotateCcw size={18} />
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
              placeholder="ログインID" aria-label="ログインID" disabled={isLocked(editingUser)}
            />

            <label htmlFor="edit-display-name">表示名</label>
            <input id="edit-display-name" className={styles.input} value={editDisplayName} maxLength={100}
              placeholder="履歴に表示する名前（未登録時はログインID）" onChange={e => setEditDisplayName(e.target.value)} />
            <input
              disabled={isLocked(editingUser)}
              className={styles.input}
              value={editPass}
                      placeholder="変更する場合のみ6文字以上"
              onChange={(e) => setEditPass(e.target.value)}
              type="password" autoComplete="new-password"
            />

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                disabled={isLocked(editingUser)}
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
