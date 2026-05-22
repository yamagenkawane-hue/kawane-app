"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { CompanyCalendar } from "@/app/type";
import styles from "./page.module.css";

export default function CalendarPage() {
  const [items, setItems] = useState<CompanyCalendar[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  // =========================
  // 取得
  // =========================

  const fetchCalendar = async () => {
    try {
      const { data, error } = await supabase
        .from("company_calendar")
        .select("*");

      if (error) throw error;

      const mapped: CompanyCalendar[] = (data || []).map((row) => ({
        id: row.id,
        date: row.date,
        name: row.name,
        isHoliday: row.is_holiday,
        type: row.type,
      }));

      mapped.sort((a, b) => a.date.localeCompare(b.date));

      setItems(mapped);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchCalendar();
      setLoading(false);
    };
    init();
  }, []);

  // =========================
  // 追加
  // =========================

  const handleAdd = async () => {
    if (!date || !name) {
      alert("日付と名称を入力してください");
      return;
    }

    try {
      const { error } = await supabase.from("company_calendar").insert({
        date,
        name,
        is_holiday: true,
        type: "holiday",
      });

      if (error) throw error;

      alert("追加しました");
      setDate("");
      setName("");
      await fetchCalendar();
    } catch (error) {
      console.error(error);
      alert("追加失敗");
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
        .from("company_calendar")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await fetchCalendar();
    } catch (error) {
      console.error(error);
      alert("削除失敗");
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
          ← 設定へ戻る
        </Link>
      </div>

      <h1 className={styles.title}>会社カレンダー</h1>

      {/* 入力 */}
      <div className={styles.formArea}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={styles.input}
        />

        <input
          type="text"
          placeholder="休日名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
        />

        <button type="button" onClick={handleAdd} className={styles.addButton}>
          追加
        </button>
      </div>

      {/* 一覧 */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>日付</th>
            <th>名称</th>
            <th>種別</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.date}</td>
              <td>{item.name}</td>
              <td>{item.type}</td>
              <td>
                <button
                  type="button"
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
  );
}
