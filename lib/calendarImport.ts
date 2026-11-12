import { isCalendarDate } from "@/lib/orderEntry";

export type CalendarYearRow = { date: string; name: string; is_holiday: boolean; type: string };

export function validateCalendarYearRows(year: number, rows: CalendarYearRow[]): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("対象年は2000〜2100年で指定してください");
  if (!rows.length || rows.length > 366) throw new Error("対象年のカレンダーは1〜366件で指定してください");
  const days = new Set<string>();
  for (const row of rows) {
    if (!isCalendarDate(row.date) || !row.date.startsWith(`${year}-`) || typeof row.is_holiday !== "boolean"
      || typeof row.name !== "string" || row.name.length > 200 || typeof row.type !== "string" || row.type.length > 50) {
      throw new Error("カレンダーの日付・休日区分・名称を確認してください");
    }
    if (days.has(row.date)) throw new Error("カレンダーの日付が重複しています");
    days.add(row.date);
  }
}
