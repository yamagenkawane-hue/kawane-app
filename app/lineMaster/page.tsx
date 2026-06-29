"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { ProcessMaster } from "@/app/type";
import styles from "./page.module.css";

type LineMaster = {
  id: string;
  lineName: string;
  processId: string;
  dailyCapacity: number;
  operationRate: number;
  enabled: boolean;
};

const LINE_SELECT_COLUMNS =
  "id,line_name,process_id,daily_capacity,operation_rate,enabled";

const PROCESS_SELECT_COLUMNS =
  "id,process_id,name,days,sort,enabled,outsourcing";

export default function LineMasterPage() {
  const [lines, setLines] = useState<LineMaster[]>([]);
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
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
      const { data, error } = await supabase
        .from("line_master")
        .select(LINE_SELECT_COLUMNS);

      if (error) throw error;

      const mapped: LineMaster[] = (data || []).map((row) => ({
        id: row.id,
        lineName: row.line_name,
        processId: row.process_id,
        dailyCapacity: row.daily_capacity,
        operationRate: row.operation_rate,
        enabled: row.enabled,
      }));

      setLines(mapped);

      const { data: processRows, error: processError } = await supabase
        .from("process_master")
        .select(PROCESS_SELECT_COLUMNS);

      if (processError) throw processError;

      setProcesses(
        (processRows || [])
          .map((row) => ({
            id: row.id,
            processId: row.process_id,
            name: row.name,
            days: row.days,
            sort: row.sort,
            enabled: row.enabled,
            outsourcing: row.outsourcing || false,
          }))
          .filter((item) => item.enabled !== false)
          .sort((a, b) => a.sort - b.sort),
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // 初期読込
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
    if (!form.lineName || !form.processId) {
      alert("必須項目を入力してください");
      return;
    }

    try {
      const { error } = await supabase.from("line_master").insert({
        line_name: form.lineName,
        process_id: form.processId,
        daily_capacity: Number(form.dailyCapacity),
        operation_rate: Number(form.operationRate),
        enabled: form.enabled,
      });

      if (error) throw error;

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
      const { error } = await supabase
        .from("line_master")
        .update({
          line_name: item.lineName,
          process_id: item.processId,
          daily_capacity: Number(item.dailyCapacity),
          operation_rate: Number(item.operationRate),
          enabled: item.enabled,
        })
        .eq("id", item.id);

      if (error) throw error;

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
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("line_master")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await fetchLines();
    } catch (error) {
      console.error(error);
    }
  };

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
            onChange={(e) => setForm({ ...form, lineName: e.target.value })}
            className={styles.input}
          />

          <select
            value={form.processId}
            onChange={(e) => setForm({ ...form, processId: e.target.value })}
            className={styles.select}
          >
            <option value="">工程選択</option>
            {processes.map((process) => (
              <option key={process.id} value={process.processId}>
                {process.name}
                {process.outsourcing ? "（外注）" : ""}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="日産能力"
            value={form.dailyCapacity}
            onChange={(e) =>
              setForm({ ...form, dailyCapacity: Number(e.target.value) })
            }
            className={styles.input}
          />

          <input
            type="number"
            placeholder="稼働率"
            value={form.operationRate}
            onChange={(e) =>
              setForm({ ...form, operationRate: Number(e.target.value) })
            }
            className={styles.input}
          />

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
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
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? { ...v, lineName: e.target.value }
                            : v,
                        ),
                      )
                    }
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    value={item.processId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? { ...v, processId: e.target.value }
                            : v,
                        ),
                      )
                    }
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={item.dailyCapacity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? { ...v, dailyCapacity: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={item.operationRate}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? { ...v, operationRate: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                    className={styles.tableInput}
                  />
                </td>

                <td>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((v) =>
                          v.id === item.id
                            ? { ...v, enabled: e.target.checked }
                            : v,
                        ),
                      )
                    }
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
