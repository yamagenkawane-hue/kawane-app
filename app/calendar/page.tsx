"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { CompanyCalendar } from "@/app/type";
import styles from "./page.module.css";

const CALENDAR_SELECT_COLUMNS =
  "id,date,name,is_holiday,type";

export default function CalendarPage() {
  const [items, setItems] = useState<CompanyCalendar[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const parseCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === "\"" && inQuote && next === "\"") {
        current += "\"";
        i++;
      } else if (char === "\"") {
        inQuote = !inQuote;
      } else if (char === "," && !inQuote) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells.map((cell) => cell.replace(/^\uFEFF/, ""));
  };

  const normalizeDate = (value: string) => {
    const trimmed = value.trim().replaceAll("/", "-");
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return "";
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  };

  const parseBoolean = (value: string | undefined) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return true;
    return ![
      "false",
      "0",
      "no",
      "n",
      "business_day",
      "workday",
      "営業日",
      "稼働日",
      "出勤日",
      "平日",
    ].includes(normalized);
  };

  const findColumn = (headers: string[], candidates: string[]) =>
    headers.findIndex((header) =>
      candidates.some((candidate) => header.toLowerCase() === candidate),
    );

  const parseCalendarCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    const firstRow = parseCsvLine(lines[0]);
    const hasHeader = firstRow.some((cell) =>
      ["date", "日付", "年月日"].includes(cell.toLowerCase()),
    );
    const headers = hasHeader ? firstRow : [];
    const rows = hasHeader ? lines.slice(1) : lines;

    const dateIndex = hasHeader
      ? findColumn(headers, ["date", "日付", "年月日"])
      : 0;
    const nameIndex = hasHeader
      ? findColumn(headers, ["name", "名称", "休日名", "備考"])
      : 1;
    const typeIndex = hasHeader
      ? findColumn(headers, ["type", "種別", "区分"])
      : 2;
    const holidayIndex = hasHeader
      ? findColumn(headers, ["is_holiday", "holiday", "休日", "休業日"])
      : 3;

    return rows
      .map((line) => {
        const cells = parseCsvLine(line);
        const normalizedDate = normalizeDate(cells[dateIndex] || "");
        const isHoliday = parseBoolean(
          holidayIndex >= 0 ? cells[holidayIndex] : cells[typeIndex],
        );
        const type =
          cells[typeIndex] ||
          (isHoliday ? "holiday" : "business_day");

        return {
          date: normalizedDate,
          name:
            cells[nameIndex] ||
            (isHoliday ? "会社休日" : "営業日"),
          is_holiday: isHoliday,
          type,
        };
      })
      .filter((row) => row.date);
  };

  // =========================
  // 取得
  // =========================

  const fetchCalendar = async () => {
    try {
      const { data, error } = await supabase
        .from("company_calendar")
        .select(CALENDAR_SELECT_COLUMNS);

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

  const handleImport = async () => {
    if (!importYear.match(/^\d{4}$/)) {
      alert("取り込み対象年を4桁で入力してください");
      return;
    }

    if (!importFile) {
      alert("CSVファイルを選択してください");
      return;
    }

    const ok = confirm(
      `${importYear}年の会社カレンダーをCSVの内容で上書きします。よろしいですか？`,
    );
    if (!ok) return;

    try {
      setImporting(true);
      const text = await importFile.text();
      const rows = parseCalendarCsv(text).filter((row) =>
        row.date.startsWith(`${importYear}-`),
      );

      if (rows.length === 0) {
        alert("対象年のカレンダー行が見つかりませんでした");
        return;
      }

      const startDate = `${importYear}-01-01`;
      const endDate = `${Number(importYear) + 1}-01-01`;

      const { error: deleteError } = await supabase
        .from("company_calendar")
        .delete()
        .gte("date", startDate)
        .lt("date", endDate);

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from("company_calendar")
        .insert(rows);

      if (insertError) throw insertError;

      alert(`${importYear}年の会社カレンダーを${rows.length}件取り込みました`);
      setImportFile(null);
      await fetchCalendar();
    } catch (error) {
      console.error(error);
      alert("会社カレンダーの取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      {/* 戻る */}
      <div className={styles.backArea}>
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
        </Link>
      </div>

      <h1 className={styles.title}>休日マスタ</h1>

      {/* 入力 */}
      <div className={styles.importCard}>
        <div>
          <h2>会社カレンダー取り込み</h2>
          <p>
            CSVの内容で対象年を上書きします。形式: date,name,type,is_holiday
          </p>
        </div>

        <div className={styles.importControls}>
          <input
            type="number"
            min="2000"
            max="2100"
            value={importYear}
            onChange={(event) => setImportYear(event.target.value)}
            className={styles.yearInput}
          />

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) =>
              setImportFile(event.target.files?.[0] || null)
            }
            className={styles.fileInput}
          />

          <button
            type="button"
            onClick={handleImport}
            className={styles.importButton}
            disabled={importing}
          >
            {importing ? "取り込み中..." : "取り込み"}
          </button>
        </div>
      </div>

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
