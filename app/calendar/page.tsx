"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
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

  type CalendarImportRow = {
    date: string;
    name: string;
    is_holiday: boolean;
    type: string;
  };

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

  const mapCalendarRows = (rawRows: string[][]): CalendarImportRow[] => {
    const rows = rawRows.filter((row) => row.some((cell) => String(cell).trim()));
    if (rows.length === 0) return [];

    const firstRow = rows[0].map((cell) => String(cell || "").trim());
    const hasHeader = firstRow.some((cell) =>
      ["date", "日付", "年月日"].includes(cell.toLowerCase()),
    );
    const headers = hasHeader ? firstRow : [];
    const bodyRows = hasHeader ? rows.slice(1) : rows;

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

    return bodyRows
      .map((cells) => {
        const normalizedDate = normalizeDate(String(cells[dateIndex] || ""));
        const isHoliday = parseBoolean(
          holidayIndex >= 0
            ? String(cells[holidayIndex] || "")
            : String(cells[typeIndex] || ""),
        );
        const type =
          String(cells[typeIndex] || "") ||
          (isHoliday ? "holiday" : "business_day");

        return {
          date: normalizedDate,
          name:
            String(cells[nameIndex] || "") ||
            (isHoliday ? "会社休日" : "営業日"),
          is_holiday: isHoliday,
          type,
        };
      })
      .filter((row) => row.date);
  };

  const parseCalendarCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return mapCalendarRows(lines.map(parseCsvLine));
  };

  const toCellAddress = (rowIndex: number, columnIndex: number) => {
    let column = "";
    let value = columnIndex + 1;

    while (value > 0) {
      const remainder = (value - 1) % 26;
      column = String.fromCharCode(65 + remainder) + column;
      value = Math.floor((value - 1) / 26);
    }

    return `${column}${rowIndex + 1}`;
  };

  const getXml = (files: Record<string, Uint8Array>, path: string) => {
    const file = files[path];
    return file ? strFromU8(file) : "";
  };

  const getFirstWorksheetPath = (files: Record<string, Uint8Array>) => {
    const workbookXml = getXml(files, "xl/workbook.xml");
    const relsXml = getXml(files, "xl/_rels/workbook.xml.rels");
    const parser = new DOMParser();
    const workbookDoc = parser.parseFromString(workbookXml, "application/xml");
    const relsDoc = parser.parseFromString(relsXml, "application/xml");
    const firstSheet = workbookDoc.getElementsByTagName("sheet")[0];
    const relId =
      firstSheet?.getAttribute("r:id") ||
      firstSheet?.getAttribute("id") ||
      "";

    const rel = Array.from(relsDoc.getElementsByTagName("Relationship")).find(
      (node) => node.getAttribute("Id") === relId,
    );
    const target = rel?.getAttribute("Target") || "worksheets/sheet1.xml";
    return target.startsWith("/")
      ? target.replace(/^\/+/, "")
      : `xl/${target.replace(/^xl\//, "")}`;
  };

  const parseBoxedCalendarCells = (arrayBuffer: ArrayBuffer) => {
    try {
      const files = unzipSync(new Uint8Array(arrayBuffer));
      const parser = new DOMParser();
      const stylesDoc = parser.parseFromString(
        getXml(files, "xl/styles.xml"),
        "application/xml",
      );
      const worksheetDoc = parser.parseFromString(
        getXml(files, getFirstWorksheetPath(files)),
        "application/xml",
      );
      const borders = Array.from(stylesDoc.getElementsByTagName("borders")[0]?.children || []);
      const cellXfs = Array.from(stylesDoc.getElementsByTagName("cellXfs")[0]?.children || []);
      const boxedStyleIndexes = new Set<number>();

      cellXfs.forEach((xf, styleIndex) => {
        const borderId = Number(xf.getAttribute("borderId") || 0);
        const border = borders[borderId];
        if (!border) return;

        const sides = ["left", "right", "top", "bottom"].map((side) =>
          border.getElementsByTagName(side)[0]?.hasAttribute("style"),
        );
        const sideCount = sides.filter(Boolean).length;

        if (sideCount >= 3) boxedStyleIndexes.add(styleIndex);
      });

      const boxedCells = new Set<string>();
      Array.from(worksheetDoc.getElementsByTagName("c")).forEach((cell) => {
        const address = cell.getAttribute("r") || "";
        const styleIndex = Number(cell.getAttribute("s") || 0);
        if (address && boxedStyleIndexes.has(styleIndex)) {
          boxedCells.add(address);
        }
      });

      return boxedCells;
    } catch (error) {
      console.warn("Failed to parse Excel border styles", error);
      return new Set<string>();
    }
  };

  const parseDayNumber = (value: string) => {
    const match = value.trim().match(/^(\d{1,2})$/);
    if (!match) return null;

    const day = Number(match[1]);
    return day >= 1 && day <= 31 ? day : null;
  };

  const parsePrintCalendarRows = (
    rawRows: string[][],
    year: string,
    boxedCells: Set<string>,
  ): CalendarImportRow[] => {
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear)) return [];

    const weekdayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const results = new Map<string, CalendarImportRow>();
    const hasBoxedCells = boxedCells.size > 0;

    rawRows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        const monthMatch = String(cell || "").trim().match(/^(\d{1,2})月$/);
        if (!monthMatch) return;

        const month = Number(monthMatch[1]);
        if (month < 1 || month > 12) return;

        const weekdayRow = rawRows[rowIndex + 1] || [];
        const hasWeekdayHeader = weekdayLabels.every((label, offset) =>
          String(weekdayRow[columnIndex + offset] || "")
            .trim()
            .toUpperCase()
            .startsWith(label),
        );
        if (!hasWeekdayHeader) return;

        const daysInMonth = new Date(parsedYear, month, 0).getDate();

        for (let dateRowIndex = rowIndex + 2; dateRowIndex <= rowIndex + 7; dateRowIndex++) {
          for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex++) {
            const day = parseDayNumber(
              String(rawRows[dateRowIndex]?.[columnIndex + weekdayIndex] || ""),
            );
            if (!day || day > daysInMonth) continue;

            const date = `${parsedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const address = toCellAddress(dateRowIndex, columnIndex + weekdayIndex);
            const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
            const isHoliday = hasBoxedCells ? boxedCells.has(address) : isWeekend;

            results.set(date, {
              date,
              name: isHoliday ? "会社休日" : "営業日",
              is_holiday: isHoliday,
              type: isHoliday ? "holiday" : "business_day",
            });
          }
        }
      });
    });

    return Array.from(results.values()).sort((a, b) => a.date.localeCompare(b.date));
  };

  const parseCalendarExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      cellDates: true,
      type: "array",
    });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(
      worksheet,
      {
        header: 1,
        raw: false,
        dateNF: "yyyy-mm-dd",
        defval: "",
      },
    );

    const normalizedRows = rawRows.map((row) =>
      row.map((cell) => String(cell || "").trim()),
    );
    const tableRows = mapCalendarRows(normalizedRows);
    if (tableRows.length > 0) return tableRows;

    return parsePrintCalendarRows(
      normalizedRows,
      importYear,
      parseBoxedCalendarCells(arrayBuffer),
    );
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

      const holidays = mapped.filter((item) => item.isHoliday);
      holidays.sort((a, b) => a.date.localeCompare(b.date));

      setItems(holidays);
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
      alert("ExcelまたはCSVファイルを選択してください");
      return;
    }

    const ok = confirm(
      `${importYear}年の会社カレンダーを選択ファイルの内容で上書きします。よろしいですか？`,
    );
    if (!ok) return;

    try {
      setImporting(true);
      const fileName = importFile.name.toLowerCase();
      const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
      const isCsv = fileName.endsWith(".csv");
      const isPdfOrImage =
        fileName.endsWith(".pdf") ||
        importFile.type.startsWith("image/");

      if (isPdfOrImage) {
        alert(
          "PDF・画像は文字認識が必要なため、現在はExcel形式に変換してから取り込んでください。",
        );
        return;
      }

      const importedRows = isExcel
        ? await parseCalendarExcel(importFile)
        : isCsv
          ? parseCalendarCsv(await importFile.text())
          : [];

      if (!isExcel && !isCsv) {
        alert("ExcelまたはCSVファイルを選択してください");
        return;
      }

      const rows = importedRows.filter((row) =>
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
            表形式、または休日が□で囲われた年間カレンダー形式のExcelで対象年を上書きします。
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
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
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
