"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Subcontractor } from "@/app/type";
import styles from "../masterCommon.module.css";

const mapSubcontractor = (row: Record<string, unknown>): Subcontractor => ({
  id: String(row.id || ""),
  name: String(row.name || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

export default function SubcontractorsPage() {
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/masters/subcontractors");
      if (!response.ok) throw new Error("外注先マスタの取得に失敗しました");
      setItems((await response.json()).map(mapSubcontractor));
    } catch (error) {
      console.error(error);
      alert("外注先マスタの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadItems = async () => {
      await fetchItems();
    };

    void loadItems();
  }, []);

  const addItem = async () => {
    if (!name.trim()) {
      alert("外注先名を入力してください");
      return;
    }

    const response = await fetch("/api/masters/subcontractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert("登録に失敗しました");
      return;
    }
    setName("");
    await fetchItems();
  };

  const saveItem = async (item: Subcontractor) => {
    const response = await fetch("/api/masters/subcontractors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, name: item.name }),
    });
    if (!response.ok) alert("保存に失敗しました");
    await fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const response = await fetch(`/api/masters/subcontractors?id=${id}`, {
      method: "DELETE",
    });
    if (!response.ok) alert("削除に失敗しました");
    await fetchItems();
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
        </Link>
        <h1 className={styles.title}>外注先マスタ</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="外注先名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.addButton} onClick={addItem}>
            追加
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>外注先名</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.name}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row) =>
                          row.id === item.id ? { ...row, name: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button className={styles.saveButton} onClick={() => saveItem(item)}>
                    保存
                  </button>
                  <button className={styles.deleteButton} onClick={() => deleteItem(item.id)}>
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
