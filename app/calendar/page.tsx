"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import Link from "next/link";
import db from "@/lib/firebase";
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

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const snap = await getDocs(collection(db, "companyCalendar"));

        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<CompanyCalendar, "id">),
        }));

        data.sort((a, b) => a.date.localeCompare(b.date));

        setItems(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalendar();
  }, []);

  // =========================
  // 再取得
  // =========================

  const reloadCalendar = async () => {
    try {
      const snap = await getDocs(collection(db, "companyCalendar"));

      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<CompanyCalendar, "id">),
      }));

      data.sort((a, b) => a.date.localeCompare(b.date));

      setItems(data);
    } catch (error) {
      console.error(error);
    }
  };

  // =========================
  // 追加
  // =========================

  const handleAdd = async () => {
    try {
      if (!date || !name) {
        alert("日付と名称を入力してください");

        return;
      }

      await addDoc(collection(db, "companyCalendar"), {
        date,
        name,
        isHoliday: true,
        type: "holiday",
      });

      alert("追加しました");

      setDate("");

      setName("");

      reloadCalendar();
    } catch (error) {
      console.error(error);

      alert("追加失敗");
    }
  };

  // =========================
  // 削除
  // =========================

  const handleDelete = async (id: string) => {
    try {
      const ok = confirm("削除しますか？");

      if (!ok) return;

      await deleteDoc(doc(db, "companyCalendar", id));

      reloadCalendar();
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
        <Link href="/" className={styles.backButton}>
          ← ホームへ戻る
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
