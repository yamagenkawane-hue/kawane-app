"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { ProcessMaster } from "@/app/type";
import styles from "./page.module.css";

export default function ProcessMasterPage() {
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [processId, setProcessId] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState(1);
  const [sort, setSort] = useState(1);
  const [outsourcing, setOutsourcing] = useState(false);
  const [loading, setLoading] = useState(false);

  // =========================
  // 工程取得
  // =========================

  const fetchProcesses = useCallback(async () => {
    try {
      startTransition(() => setLoading(true));

      const { data, error } = await supabase.from("process_master").select("*");

      if (error) throw error;

      const mapped: ProcessMaster[] = (data || []).map((row) => ({
        id: row.id,
        processId: row.process_id,
        name: row.name,
        days: row.days,
        sort: row.sort,
        enabled: row.enabled,
        outsourcing: row.outsourcing || false,
      }));

      mapped.sort((a, b) => a.sort - b.sort);

      startTransition(() => setProcesses(mapped));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProcesses();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProcesses]);

  // =========================
  // 追加
  // =========================

  const handleAdd = async () => {
    if (!processId || !name) {
      alert("入力してください");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.from("process_master").insert({
        process_id: processId,
        name,
        days,
        sort,
        enabled: true,
        outsourcing,
      });

      if (error) throw error;

      setProcessId("");
      setName("");
      setDays(1);
      setSort(1);
      setOutsourcing(false);

      await fetchProcesses();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // 入力変更
  // =========================

  const handleChange = (
    id: string,
    field: keyof ProcessMaster,
    value: string | number | boolean,
  ) => {
    setProcesses((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  // =========================
  // 保存
  // =========================

  const handleSave = async (process: ProcessMaster) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("process_master")
        .update({
          process_id: process.processId,
          name: process.name,
          days: process.days,
          sort: process.sort,
          enabled: process.enabled,
          outsourcing: process.outsourcing || false,
        })
        .eq("id", process.id);

      if (error) throw error;

      alert("保存しました");
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // ON/OFF切替
  // =========================

  const handleToggle = async (process: ProcessMaster) => {
    try {
      const { error } = await supabase
        .from("process_master")
        .update({ enabled: !process.enabled })
        .eq("id", process.id);

      if (error) throw error;

      setProcesses((prev) =>
        prev.map((item) =>
          item.id === process.id
            ? { ...item, enabled: !process.enabled }
            : item,
        ),
      );
    } catch (error) {
      console.error(error);
    }
  };

  // =========================
  // 削除
  // =========================

  const handleDelete = async (id: string) => {
    const result = confirm("削除しますか？");
    if (!result) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from("process_master")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await fetchProcesses();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.headerArea}>
        <Link href="/settings" className={styles.backButton}>
          ← 設定へ戻る
        </Link>

        <h1 className={styles.title}>工程マスタ</h1>
      </div>

      {/* 入力フォーム */}
      <div className={styles.form}>
        <input
          type="text"
          placeholder="工程ID"
          value={processId}
          onChange={(e) => setProcessId(e.target.value)}
          className={styles.input}
        />

        <input
          type="text"
          placeholder="工程名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
        />

        <input
          type="number"
          placeholder="必要日数"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={styles.numberInput}
        />

        <input
          type="number"
          placeholder="順番"
          value={sort}
          onChange={(e) => setSort(Number(e.target.value))}
          className={styles.numberInput}
        />

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={outsourcing}
            onChange={(e) => setOutsourcing(e.target.checked)}
          />
          外注工程
        </label>

        <button onClick={handleAdd} className={styles.addButton}>
          追加
        </button>
      </div>

      {/* Loading */}
      {loading && <div className={styles.loading}>読み込み中...</div>}

      {/* 一覧 */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>工程ID</th>
            <th>工程名</th>
            <th>日数</th>
            <th>順番</th>
            <th>外注</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          {processes.map((process) => (
            <tr key={process.id}>
              <td>
                <input
                  value={process.processId}
                  onChange={(e) =>
                    handleChange(process.id, "processId", e.target.value)
                  }
                  className={styles.input}
                />
              </td>

              <td>
                <input
                  value={process.name}
                  onChange={(e) =>
                    handleChange(process.id, "name", e.target.value)
                  }
                  className={styles.input}
                />
              </td>

              <td>
                <input
                  type="number"
                  value={process.days}
                  onChange={(e) =>
                    handleChange(process.id, "days", Number(e.target.value))
                  }
                  className={styles.numberInput}
                />
              </td>

              <td>
                <input
                  type="number"
                  value={process.sort}
                  onChange={(e) =>
                    handleChange(process.id, "sort", Number(e.target.value))
                  }
                  className={styles.numberInput}
                />
              </td>

              <td>
                <input
                  type="checkbox"
                  checked={process.outsourcing || false}
                  onChange={(e) =>
                    handleChange(process.id, "outsourcing", e.target.checked)
                  }
                />
              </td>

              <td>
                <button
                  onClick={() => handleToggle(process)}
                  className={
                    process.enabled
                      ? styles.enabledButton
                      : styles.disabledButton
                  }
                >
                  {process.enabled ? "使用中" : "停止中"}
                </button>
              </td>

              <td className={styles.actionArea}>
                <button
                  onClick={() => handleSave(process)}
                  className={styles.saveButton}
                >
                  保存
                </button>

                <button
                  onClick={() => handleDelete(process.id)}
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
  );
}
