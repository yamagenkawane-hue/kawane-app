import { processActuals } from "./actuals";
import type { CompanyCalendar, LineMaster, OrderProcess, ProcessMaster, ProcessResult } from "@/app/type";

type LegacyProcess = Pick<OrderProcess, "id" | "processName" | "processOrder" | "overlapDays" | "plannedAmount" | "completedAmount" | "completedDate">;
type LegacyResult = Pick<ProcessResult, "orderProcessId" | "date" | "amount"> & Partial<Pick<ProcessResult, "processId">>;
type LegacyMaster = Pick<ProcessMaster, "name" | "processId">;
type LegacyLine = Pick<LineMaster, "processId" | "dailyCapacity" | "enabled">;
type LegacyCalendar = Pick<CompanyCalendar, "date" | "isHoliday">;

export type LegacyPrediction = {
  id: string;
  name: string;
  actualStart: string | null;
  actualEnd: string | null;
  predictedStart: string | null;
  predictedEnd: string | null;
  progress: number;
  completedAmount: number;
  remainingAmount: number;
};

// Date-only arithmetic avoids differences between the browser timezone and Vercel UTC.
const parseDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);

/** The existing AI-OFF gantt baseline, without Gemini or the old AI adjustments. */
export function calculateLegacyPredictions(input: {
  referenceDate: string;
  orderAmount: number;
  processes: LegacyProcess[];
  results: LegacyResult[];
  masters: LegacyMaster[];
  lines: LegacyLine[];
  calendar: LegacyCalendar[];
}): LegacyPrediction[] {
  const { referenceDate, orderAmount, results, masters, lines, calendar } = input;
  const holidays = new Map(calendar.map(row => [row.date.slice(0, 10), row.isHoliday]));
  const isHoliday = (date: Date) => holidays.get(dateKey(date)) ?? [0, 6].includes(date.getUTCDay());
  const shift = (date: Date, days: number) => {
    const result = new Date(date);
    let remaining = Math.abs(days);
    while (remaining > 0) {
      result.setUTCDate(result.getUTCDate() + (days >= 0 ? 1 : -1));
      if (!isHoliday(result)) remaining--;
    }
    return result;
  };
  const onOrAfter = (date: Date) => {
    const result = new Date(date);
    while (isHoliday(result)) result.setUTCDate(result.getUTCDate() + 1);
    return result;
  };
  let cursor = onOrAfter(parseDate(referenceDate));
  let previous: LegacyPrediction | undefined;

  return [...input.processes].sort((a, b) => a.processOrder - b.processOrder).map(process => {
    if (previous?.predictedStart && previous.predictedEnd) {
      const overlap = Math.max(0, Math.floor(process.overlapDays || 0));
      const candidate = shift(parseDate(previous.predictedEnd), 1 - overlap);
      cursor = overlap > 0 && dateKey(candidate) < previous.predictedStart
        ? parseDate(previous.predictedStart) : candidate;
    }
    const master = masters.find(row => row.name === process.processName || row.processId === process.processName);
    const line = lines.find(row => master && row.processId === master.processId && row.enabled !== false);
    // Preserve the historical AI-OFF fallback (1 item/day) for a missing capacity.
    const capacity = Math.max(1, Number(line?.dailyCapacity || 1));
    const logs = results.filter(row => row.orderProcessId === process.id || row.processId === process.id).sort((a, b) => a.date.localeCompare(b.date));
    const planned = Number(process.plannedAmount || orderAmount);
    const completed = Math.max(Number(process.completedAmount || 0), logs.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const remaining = Math.max(0, planned - completed);
    const facts = processActuals(planned, completed, process.completedDate, logs);
    const actualStart = facts.actualStart ? parseDate(facts.actualStart) : null;
    const actualEnd = facts.actualEnd ? parseDate(facts.actualEnd) : null;
    const start = actualEnd ? shift(actualEnd, 1) : onOrAfter(cursor);
    const end = shift(start, Math.max(1, Math.ceil(remaining / capacity)) - 1);
    const progress = planned > 0 ? Math.min(100, Math.floor(completed / planned * 100)) : 100;
    const blocked = Boolean(previous && !previous.predictedEnd && !facts.actualEnd);
    const finished = remaining <= 0;
    const predictedStart = finished ? facts.completionDate : blocked ? null : dateKey(start);
    const predictedEnd = finished ? facts.completionDate : blocked ? null : dateKey(end);
    previous = {
      id: process.id, name: process.processName,
      actualStart: actualStart ? dateKey(actualStart) : null, actualEnd: actualEnd ? dateKey(actualEnd) : null,
      predictedStart, predictedEnd,
      progress: remaining <= 0 ? 100 : progress, completedAmount: completed, remainingAmount: remaining,
    };
    if (predictedEnd) cursor = shift(parseDate(predictedEnd), 1);
    return previous;
  });
}
