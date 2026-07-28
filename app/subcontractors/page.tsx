"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProcessMaster, Subcontractor } from "@/app/type";
import styles from "../masterCommon.module.css";

const mapSubcontractor = (row: Record<string, unknown>): Subcontractor => ({
  id: String(row.id || ""),
  name: String(row.name || ""),
  processName: String(row.process_name || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapProcessMaster = (row: Record<string, unknown>): ProcessMaster => ({
  id: String(row.id || ""),
  processId: String(row.process_id || ""),
  name: String(row.name || ""),
  days: Number(row.days || 0),
  sort: Number(row.sort || 0),
  enabled: Boolean(row.enabled ?? true),
  outsourcing: Boolean(row.outsourcing || false),
});

export default function SubcontractorsPage() {
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [processMasters, setProcessMasters] = useState<ProcessMaster[]>([]);
  const [name, setName] = useState("");
  const [processName, setProcessName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [subcontractorResponse, processResponse] = await Promise.all([
        fetch("/api/masters/subcontractors"),
        fetch("/api/processes"),
      ]);

      if (!subcontractorResponse.ok) {
        throw new Error("外注先マスタの取得に失敗しました");
      }
      if (!processResponse.ok) {
        throw new Error("工程マスタの取得に失敗しました");
      }

      setItems((await subcontractorResponse.json()).map(mapSubcontractor));
      setProcessMasters((await processResponse.json()).map(mapProcessMaster));
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
    if (!name.trim() || !processName.trim()) {
      alert("外注先名と工程名を入力してください");
      return;
    }

    const response = await fetch("/api/masters/subcontractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, process_name: processName }),
    });
    if (!response.ok) {
      alert("登録に失敗しました");
      return;
    }
    setName("");
    setProcessName("");
    await fetchItems();
  };

  const saveItem = async (item: Subcontractor) => {
    const response = await fetch("/api/masters/subcontractors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        name: item.name,
        process_name: item.processName,
      }),
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
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
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
          <select
            className={styles.select}
            value={processName}
            onChange={(e) => setProcessName(e.target.value)}
          >
            <option value="">工程名を選択</option>
            {processMasters.map((process) => (
              <option key={process.id} value={process.name}>
                {process.name}
              </option>
            ))}
          </select>
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
              <th>工程名</th>
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
                <td>
                  <select
                    className={styles.select}
                    value={item.processName}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row) =>
                          row.id === item.id
                            ? { ...row, processName: e.target.value }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="">工程名を選択</option>
                    {processMasters.map((process) => (
                      <option key={process.id} value={process.name}>
                        {process.name}
                      </option>
                    ))}
                  </select>
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
