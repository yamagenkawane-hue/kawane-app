import { actualDate } from "./aiPrediction/actuals";

export type OutsourceTransferDates = {
  sentDate: string;
  expectedDate: string;
  returnedDate: string;
};

export function isOutsourceTransfer(source: {
  process_name: string;
  subcontractor_id?: string | null;
  product_processes?: unknown;
}) {
  const firstRecord = (value: unknown): Record<string, unknown> => {
    const row = Array.isArray(value) ? value[0] : value;
    return row && typeof row === "object" ? row as Record<string, unknown> : {};
  };
  const productProcess = firstRecord(source.product_processes);
  const master = firstRecord(productProcess.process_master);
  return Boolean(source.subcontractor_id) || master.outsourcing === true ||
    /外注|メッキ/.test(source.process_name);
}

export function validateOutsourceTransferDates(dates: OutsourceTransferDates, today: string) {
  if (Object.values(dates).some(date => !date || actualDate(date) !== date)) {
    return "出し日・予定日・実績日をすべて正しい日付で入力してください。";
  }
  if (dates.sentDate > today || dates.returnedDate > today) {
    return "出し日・実績日は本日以前の日付を入力してください。";
  }
  if (dates.expectedDate < dates.sentDate || dates.returnedDate < dates.sentDate) {
    return "予定日・実績日は出し日以降の日付を入力してください。";
  }
  return "";
}
