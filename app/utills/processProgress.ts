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

export type OrderProcessCompletionRow = {
  post_id?: string | null;
  process_order?: number | string | null;
  completed_amount?: number | string | null;
};

export type OutsourceDisplayStatus = "外注" | "外注済";

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


export type ProcessDisplayStatus =
  | "未着手"
  | "製造中"
  | "製造完了"
  | "洗浄中"
  | "洗浄完了"
  | "検査中"
  | "検査完了"
  | "計量中"
  | "計量完了"
  | "梱包中"
  | "梱包完了";

export type ProcessStatusValue = {
  status: ProcessDisplayStatus;
  processOrder: number;
};

export type OutsourceStatusValue = {
  status: OutsourceDisplayStatus;
  processOrder: number;
};

export type OrderProcessStatusRow = {
  post_id?: string | null;
  process_name?: string | null;
  process_order?: number | string | null;
  planned_amount?: number | string | null;
  completed_amount?: number | string | null;
};

const processStatusLabels: Record<
  keyof ProcessProgress,
  { inProgress: ProcessDisplayStatus; completed: ProcessDisplayStatus }
> = {
  manufacturingLogs: { inProgress: "製造中", completed: "製造完了" },
  cleaningLogs: { inProgress: "洗浄中", completed: "洗浄完了" },
  inspectionLogs: { inProgress: "検査中", completed: "検査完了" },
  measurementLogs: { inProgress: "計量中", completed: "計量完了" },
  packagingLogs: { inProgress: "梱包中", completed: "梱包完了" },
};

export const buildOrderProcessStatusMap = <T extends OrderProcessStatusRow>(
  rows: T[],
) => {
  const rowsByPost = new Map<string, T[]>();

  for (const row of rows) {
    const postId = row.post_id || "";
    if (!postId) continue;

    rowsByPost.set(postId, [...(rowsByPost.get(postId) || []), row]);
  }

  const statusMap = new Map<string, ProcessStatusValue>();

  for (const [postId, postRows] of rowsByPost.entries()) {
    const orderedRows = [...postRows].sort(
      (a, b) => Number(a.process_order || 0) - Number(b.process_order || 0),
    );

    for (const row of orderedRows) {
      const completedAmount = Number(row.completed_amount || 0);
      if (completedAmount <= 0) continue;

      const logKey = getProcessLogKey(
        row.process_name || "",
        Number(row.process_order || 0),
      );
      if (!logKey) continue;

      const plannedAmount = Number(row.planned_amount || 0);
      const labels = processStatusLabels[logKey];
      statusMap.set(postId, {
        status:
          plannedAmount > 0 && completedAmount >= plannedAmount
            ? labels.completed
            : labels.inProgress,
        processOrder: Number(row.process_order || 0),
      });
    }
  }

  return statusMap;
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

export const buildOutsourceStatusDetailMap = <T extends OutsourceProgressRow>(
  rows: T[],
) => {
  const rowsByPost = new Map<string, T[]>();

  for (const row of rows) {
    const postId = row.post_id || "";
    if (!postId) continue;

    rowsByPost.set(postId, [...(rowsByPost.get(postId) || []), row]);
  }

  const statusMap = new Map<string, OutsourceStatusValue>();

  for (const [postId, postRows] of rowsByPost.entries()) {
    const activeOutsourceRows = postRows.filter((row) => {
      const hasOutsourceMarker =
        Boolean(row.subcontractor_id) ||
        Boolean(row.outsource_sent_date) ||
        Boolean(row.outsource_returned_date) ||
        row.outsource_status === "sent" ||
        row.outsource_status === "returned";

      if (!hasOutsourceMarker) return false;

      return (
        Boolean(row.outsource_sent_date) ||
        Boolean(row.outsource_returned_date) ||
        row.outsource_status === "sent" ||
        row.outsource_status === "returned" ||
        Number(row.completed_amount || 0) >= Number(row.planned_amount || 0)
      );
    });

    if (activeOutsourceRows.length === 0) continue;

    const latestOutsourceRow = [...activeOutsourceRows].sort(
      (a, b) => Number(b.process_order || 0) - Number(a.process_order || 0),
    )[0];

    const isReturnedOrCompleted = activeOutsourceRows.some(
      (row) =>
        row.outsource_status === "returned" ||
        Boolean(row.outsource_returned_date) ||
        (Number(row.planned_amount || 0) > 0 &&
          Number(row.completed_amount || 0) >= Number(row.planned_amount || 0)),
    );

    statusMap.set(postId, {
      status: isReturnedOrCompleted ? "外注済" : "外注",
      processOrder: Number(latestOutsourceRow?.process_order || 0),
    });
  }

  return statusMap;
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

  const statusMap = new Map<string, OutsourceDisplayStatus>();

  for (const [postId, postRows] of rowsByPost.entries()) {
    const activeOutsourceRows = postRows.filter((row) => {
      const hasOutsourceMarker =
        Boolean(row.subcontractor_id) ||
        Boolean(row.outsource_sent_date) ||
        Boolean(row.outsource_returned_date) ||
        row.outsource_status === "sent" ||
        row.outsource_status === "returned";

      if (!hasOutsourceMarker) return false;

      return (
        Boolean(row.outsource_sent_date) ||
        Boolean(row.outsource_returned_date) ||
        row.outsource_status === "sent" ||
        row.outsource_status === "returned" ||
        Number(row.completed_amount || 0) >= Number(row.planned_amount || 0)
      );
    });

    if (activeOutsourceRows.length === 0) continue;

    if (
      activeOutsourceRows.some(
        (row) =>
          row.outsource_status === "returned" ||
          Boolean(row.outsource_returned_date) ||
          (Number(row.planned_amount || 0) > 0 &&
            Number(row.completed_amount || 0) >= Number(row.planned_amount || 0)),
      )
    ) {
      statusMap.set(postId, "外注済");
      continue;
    }

    statusMap.set(postId, "外注");
  }

  return statusMap;
};

export const buildFinalProcessCompletionMap = <
  T extends OrderProcessCompletionRow,
>(
  rows: T[],
) => {
  const completionMap = new Map<
    string,
    { processOrder: number; completedAmount: number }
  >();

  for (const row of rows) {
    const postId = row.post_id || "";
    if (!postId) continue;

    const processOrder = Number(row.process_order || 0);
    const completedAmount = Number(row.completed_amount || 0);
    const current = completionMap.get(postId);

    if (!current || processOrder > current.processOrder) {
      completionMap.set(postId, { processOrder, completedAmount });
    }
  }

  return new Map(
    [...completionMap.entries()].map(([postId, value]) => [
      postId,
      value.completedAmount,
    ]),
  );
};
