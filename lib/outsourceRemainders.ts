import { actualDate } from "./aiPrediction/actuals";

export type OutsourceRemainder = {
  id: string;
  orderProcessId: string;
  quantity: number;
  movedAmount: number;
  sequence: number;
  sentDate: string;
  expectedDate: string;
  returnedDate: string;
  note: string;
  updatedAt: string;
};

export const REMAINDER_COLUMNS = "id,order_process_id,dispatch_no,quantity,moved_amount,sent_date,expected_date,returned_date,note,updated_at";
export const mapOutsourceRemainder = (row: Record<string, unknown>): OutsourceRemainder => ({
  id: String(row.id), orderProcessId: String(row.order_process_id), quantity: Number(row.quantity),
  movedAmount: Number(row.moved_amount || 0), sentDate: String(row.sent_date || ""),
  sequence: Number(row.dispatch_no),
  expectedDate: String(row.expected_date || ""), returnedDate: String(row.returned_date || ""),
  note: String(row.note || ""), updatedAt: String(row.updated_at || ""),
});

export const availableRemainderAmount = (remaining: number, schedules: OutsourceRemainder[]) =>
  Math.max(0, remaining - schedules.reduce((sum, item) => sum + Math.max(0, item.quantity - item.movedAmount), 0));

export function validateRemainderDates(item: Pick<OutsourceRemainder, "sentDate" | "expectedDate" | "returnedDate">, today: string) {
  if ([item.sentDate,item.expectedDate,item.returnedDate].some(date => date && actualDate(date) !== date)) return "正しい日付を入力してください。";
  if (item.sentDate > today || item.returnedDate > today) return "出し日・実績日は本日以前で入力してください。";
  if (item.returnedDate && !item.sentDate) return "実績日を登録する場合は出し日も入力してください。";
  if (item.sentDate && ((item.expectedDate && item.expectedDate < item.sentDate) || (item.returnedDate && item.returnedDate < item.sentDate))) return "予定日・実績日は出し日以降で入力してください。";
  return "";
}
