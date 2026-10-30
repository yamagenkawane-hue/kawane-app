import type { LotProcessBalance } from "@/app/type";

export type ProcessKind = NonNullable<LotProcessBalance["processKind"]>;
type Process = Partial<LotProcessBalance>;

export function isOutsourceProcess(process: Process) {
  return process.isOutsource === true || Boolean(process.subcontractorName) || /外注|メッキ/.test(process.processName || "");
}

export function getProcessKind(process: Process): ProcessKind {
  if (process.processKind) return process.processKind;
  const name = process.processName || "";
  if (/製造|プレス/.test(name)) return "manufacturing";
  if (/洗浄/.test(name)) return "cleaning";
  if (/検査|品質/.test(name)) return "inspection";
  if (/計量/.test(name)) return "measurement";
  if (/梱包|包装/.test(name)) return "packaging";
  return "other";
}

/** Every active balance belongs to exactly one display column. */
export function getProgressDisplayGroup(process: Process) {
  if (isOutsourceProcess(process)) return "cleaning";
  const kind = getProcessKind(process);
  if (kind === "packaging") return "measurement"; // Packaging-waiting stock is completed here.
  return kind === "other" ? "cleaning" : kind;
}

export function isCompletionProcess(process: Process) {
  return !isOutsourceProcess(process) && ["measurement", "packaging"].includes(getProcessKind(process));
}

export function getWeightedProcessProgress(balances: Process[], orderAmount: number) {
  if (orderAmount <= 0) return 0;
  const weighted = balances.reduce((sum, balance) => {
    if (balance.isHistoryOnly) return sum;
    const position = balance.processPosition;
    const count = balance.processCount;
    const semanticRates: Record<ProcessKind, number> = {
      manufacturing: 0, cleaning: 20, inspection: 40, measurement: 60, packaging: 80, other: 0,
    };
    const rate = balance.isCompleted ? 100
      : position && count && count > 0
        ? Math.min(Math.max(position - 1, 0), count - 1) / count * 100
        : isOutsourceProcess(balance) ? 20 : semanticRates[getProcessKind(balance)];
    return sum + Math.max(0, Number(balance.quantity || 0)) * rate;
  }, 0);
  return Math.min(100, Math.round(weighted / orderAmount));
}

type OrderProcess = {
  id: string;
  post_id: string;
  process_name: string;
  process_order: number;
  product_process_id?: string | null;
  subcontractor_id?: string | null;
};

export function buildProcessDisplayMap(
  processes: OrderProcess[], productProcesses: { id: string; process_master: unknown }[],
) {
  const firstRecord = (value: unknown): Record<string, unknown> => {
    const row = Array.isArray(value) ? value[0] : value;
    return row && typeof row === "object" ? row as Record<string, unknown> : {};
  };
  const masters = new Map(productProcesses.map(row => [row.id, firstRecord(row.process_master)]));
  const grouped = new Map<string, OrderProcess[]>();
  for (const process of processes) grouped.set(process.post_id, [...(grouped.get(process.post_id) || []), process]);
  const result = new Map<string, Pick<LotProcessBalance, "processKind" | "isOutsource" | "processPosition" | "processCount">>();
  const knownKinds: ProcessKind[] = ["manufacturing", "cleaning", "inspection", "measurement", "packaging"];
  for (const rows of grouped.values()) {
    rows.sort((a, b) => a.process_order - b.process_order || a.id.localeCompare(b.id));
    rows.forEach((row, index) => {
      const master = masters.get(row.product_process_id || "") || {};
      const masterKind = String(master.process_id || "") as ProcessKind;
      result.set(row.id, {
        processKind: knownKinds.includes(masterKind) ? masterKind
          : getProcessKind({ processName: String(master.name || row.process_name) }),
        isOutsource: Boolean(row.subcontractor_id) || master.outsourcing === true || /外注|メッキ/.test(row.process_name),
        processPosition: index + 1,
        processCount: rows.length,
      });
    });
  }
  return result;
}
