"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import db from "@/lib/firebase";

import styles from "./page.module.css";

type LineMaster = {
  id: string;
  lineName: string;
  processId: string;
  dailyCapacity: number;
  operationRate: number;
  enabled: boolean;
};

export default function LineMasterPage() {
  const [lines, setLines] = useState<LineMaster[]>([]);

  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    lineName: "",
    processId: "",
    dailyCapacity: 0,
    operationRate: 100,
    enabled: true,
  });

  // =========================
  // データ取得
  // =========================

  const fetchLines = async () => {
    try {
      const snap = await getDocs(collection(db, "lineMaster"));

      const data = snap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<LineMaster, "id">),
      }));

      setLines(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // 初期読込
  // React19対応
  // =========================

  useEffect(() => {
    const load = async () => {
      await fetchLines();
    };

    void load();
  }, []);

  // =========================
  // 追加
  // =========================

  const handleAdd = async () => {
    try {
      if (!form.lineName || !form.processId) {
        alert("必須項目を入力してください");

        return;
      }

      await addDoc(collection(db, "lineMaster"), {
        lineName: form.lineName,
        processId: form.processId,
        dailyCapacity: Number(form.dailyCapacity),
        operationRate: Number(form.operationRate),
        enabled: form.enabled,
      });

      setForm({
        lineName: "",
        processId: "",
        dailyCapacity: 0,
        operationRate: 100,
        enabled: true,
      });

      await fetchLines();
    } catch (error) {
      console.error(error);
    }
  };

  // =========================
  // 更新
  // =========================

  const handleUpdate = async (item: LineMaster) => {
    try {
      await updateDoc(doc(db, "lineMaster", item.id), {
        lineName: item.lineName,
        processId: item.processId,
        dailyCapacity: Number(item.dailyCapacity),
        operationRate: Number(item.operationRate),
        enabled: item.enabled,
      });

      await fetchLines();
    } catch (error) {
      console.error(error);
    }
  };

  // =========================
  // 削除
  // =========================

  const handleDelete = async (id: string) => {
    const ok = confirm("削除しますか？");

    if (!ok) {
      return;
    }

    try {
      await deleteDoc(doc(db, "lineMaster", id));

      await fetchLines();
    } catch (error) {
      console.error(error);
    }
  };

  // =========================
  // Loading
  // =========================

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      {/* 戻る */}
      <div className={styles.backArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 戻る
        </Link>
      </div>

      {/* タイトル */}
      <h1 className={styles.title}>ライン能力設定</h1>

      {/* 追加フォーム */}
      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            type="text"
            placeholder="ライン名"
            value={form.lineName}
            onChange={(e) =>
              setForm({
                ...form,
                lineName: e.target.value,
              })
            }
            className={styles.input}
          />

          <select
            value={form.processId}
            onChange={(e) =>
              setForm({
                ...form,
                processId: e.target.value,
              })
            }
            className={styles.select}
          >
            <option value="">工程選択</option>

            <option value="manufacturing">製造</option>

            <option value="cleaning">洗浄</option>

            <option value="inspection">検査</option>

            <option value="measurement">測量</option>

            <option value="packaging">梱包</option>
          </select>

          <input
            type="number"
            placeholder="日産能力"
            value={form.dailyCapacity}
            onChange={(e) =>
              setForm({
                ...form,
                dailyCapacity: Number(e.target.value),
              })
            }
            className={styles.input}
          />

          <input
            type="number"
            placeholder="稼働率"
            value={form.operationRate}
            onChange={(e) =>
              setForm({
                ...form,
                operationRate: Number(e.target.value),
              })
            }
            className={styles.input}
          />

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm({
                  ...form,
                  enabled: e.target.checked,
                })
              }
            />
            使用
          </label>
        </div>

        <button onClick={handleAdd} className={styles.addButton}>
          追加
        </button>
      </div>

      {/* 一覧 */}
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ライン名</th>
              <th>工程</th>
              <th>日産能力</th>
              <th>稼働率</th>
              <th>使用</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {lines.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    value={item.lineName}
                    onChange={(e) => {
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? {
                                ...v,
                                lineName: e.target.value,
                              }
                            : v,
                        ),
                      );
                    }}
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    value={item.processId}
                    onChange={(e) => {
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? {
                                ...v,
                                processId: e.target.value,
                              }
                            : v,
                        ),
                      );
                    }}
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={item.dailyCapacity}
                    onChange={(e) => {
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? {
                                ...v,
                                dailyCapacity: Number(e.target.value),
                              }
                            : v,
                        ),
                      );
                    }}
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={item.operationRate}
                    onChange={(e) => {
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? {
                                ...v,
                                operationRate: Number(e.target.value),
                              }
                            : v,
                        ),
                      );
                    }}
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => {
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? {
                                ...v,
                                enabled: e.target.checked,
                              }
                            : v,
                        ),
                      );
                    }}
                  />
                </td>

                <td className={styles.actionArea}>
                  <button
                    onClick={() => handleUpdate(item)}
                    className={styles.saveButton}
                  >
                    保存
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className={styles.deleteButton}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
