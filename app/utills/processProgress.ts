export type ProcessLog = {
  date: string;
  amount: number;
};

export type ProcessProgress = {
  manufacturingLogs: ProcessLog[];
  cleaningLogs: ProcessLog[];
  inspectionLogs: ProcessLog[];
  measurementLogs: ProcessLog[];
  packagingLogs: ProcessLog[];
};

export type OutsourceProgressRow = {
  post_id?: string | null;
  process_order?: number | string | null;
  planned_amount?: number | string | null;
  completed_amount?: number | string | null;
  subcontractor_id?: string | null;
  outsource_status?: string | null;
  outsource_sent_date?: string | null;
  outsource_returned_date?: string | null;
};

export const createEmptyProcessProgress = (): ProcessProgress => ({
  manufacturingLogs: [],
  cleaningLogs: [],
  inspectionLogs: [],
  measurementLogs: [],
  packagingLogs: [],
});

export const getProcessLogKey = (
  processName: string,
  processOrder: number,
): keyof ProcessProgress | null => {
  if (
    processName.includes("製造") ||
    processName.includes("プレス") ||
    processOrder === 1
  ) {
    return "manufacturingLogs";
  }
  if (processName.includes("洗浄")) return "cleaningLogs";
  if (processName.includes("検査")) return "inspectionLogs";
  if (processName.includes("計量")) return "measurementLogs";
  if (processName.includes("梱包") || processName.includes("包装")) {
    return "packagingLogs";
  }

  return null;
};

export const getPreferredLogs = (
  orderProcessLogs: ProcessLog[],
  productionResultLogs: ProcessLog[],
  legacyLogs: ProcessLog[],
) => {
  if (orderProcessLogs.length > 0) return orderProcessLogs;
  if (productionResultLogs.length > 0) return productionResultLogs;
  return legacyLogs;
};

export const sumProcessLogs = (logs: ProcessLog[]) =>
  logs.reduce((sum, log) => sum + Number(log.amount || 0), 0);

export const buildOrderProcessProgressMap = <
  T extends {
    post_id?: string | null;
    process_name?: string | null;
    process_order?: number | string | null;
    completed_amount?: number | string | null;
    completed_date?: string | null;
  },
>(
  rows: T[],
) => {
  const progressMap = new Map<string, ProcessProgress>();

  for (const row of rows) {
    const postId = row.post_id || "";
    const completedAmount = Number(row.completed_amount || 0);
    if (!postId || completedAmount <= 0) continue;

    const logKey = getProcessLogKey(
      row.process_name || "",
      Number(row.process_order || 0),
    );
    if (!logKey) continue;

    const progress = progressMap.get(postId) || createEmptyProcessProgress();
    progress[logKey].push({
      date: row.completed_date || "",
      amount: completedAmount,
    });
    progressMap.set(postId, progress);
  }

  return progressMap;
};

export const buildProductionResultProgressMap = <
  T extends {
    post_id?: string | null;
    process_name?: string | null;
    date?: string | null;
    amount?: number | string | null;
  },
>(
  rows: T[],
) => {
  const progressMap = new Map<string, ProcessProgress>();

  for (const row of rows) {
    const postId = row.post_id || "";
    const amount = Number(row.amount || 0);
    if (!postId || amount <= 0) continue;

    const logKey = getProcessLogKey(row.process_name || "", 0);
    if (!logKey) continue;

    const progress = progressMap.get(postId) || createEmptyProcessProgress();
    progress[logKey].push({
      date: row.date || "",
      amount,
    });
    progressMap.set(postId, progress);
  }

  return progressMap;
};

export const buildOutsourceStatusMap = <T extends OutsourceProgressRow>(
  rows: T[],
) => {
  const rowsByPost = new Map<string, T[]>();

  for (const row of rows) {
    const postId = row.post_id || "";
    if (!postId) continue;

    rowsByPost.set(postId, [...(rowsByPost.get(postId) || []), row]);
  }

  const statusMap = new Map<string, "外注" | "外注済">();

  for (const [postId, postRows] of rowsByPost.entries()) {
    const sortedRows = [...postRows].sort(
      (a, b) => Number(a.process_order || 0) - Number(b.process_order || 0),
    );
    const currentRow = sortedRows.find(
      (row) =>
        Number(row.completed_amount || 0) < Number(row.planned_amount || 0),
    );
    const outsourceRows = sortedRows.filter(
      (row) =>
        Boolean(row.subcontractor_id) ||
        Boolean(row.outsource_sent_date) ||
        Boolean(row.outsource_returned_date) ||
        (row.outsource_status || "not_sent") !== "not_sent",
    );

    const targetRows = outsourceRows.filter(
      (row) =>
        row === currentRow ||
        row.outsource_status === "sent" ||
        row.outsource_status === "returned" ||
        Boolean(row.outsource_sent_date) ||
        Boolean(row.outsource_returned_date),
    );

    if (
      targetRows.some(
        (row) =>
          row.outsource_status === "returned" ||
          Boolean(row.outsource_returned_date),
      )
    ) {
      statusMap.set(postId, "外注済");
      continue;
    }

    if (targetRows.length > 0) {
      statusMap.set(postId, "外注");
    }
  }

  return statusMap;
};
