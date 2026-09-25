import type { CompanyCalendar, LineMaster, OrderProcess, ProcessMaster, ProcessResult } from "@/app/type";

type LegacyProcess = Pick<OrderProcess, "id" | "processName" | "processOrder" | "overlapDays" | "plannedAmount" | "completedAmount" | "completedDate">;
type LegacyResult = Pick<ProcessResult, "orderProcessId" | "date" | "amount"> & Partial<Pick<ProcessResult, "processId">>;
type LegacyMaster = Pick<ProcessMaster, "name" | "processId">;
type LegacyLine = Pick<LineMaster, "processId" | "dailyCapacity" | "enabled">;
type LegacyCalendar = Pick<CompanyCalendar, "date" | "isHoliday">;

export type LegacyPrediction = {
  id: string;
  name: string;
  actualStart: string;
  actualEnd: string | null;
  predictedStart: string;
  predictedEnd: string;
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
    if (previous) {
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
    let actualStart = new Date(cursor);
    let actualEnd: Date | null = null;
    let start = new Date(cursor);
    let end = new Date(cursor);
    let progress = 0;
    const finish = (from: Date, quantity: number) => shift(from, Math.max(1, Math.ceil(quantity / capacity)) - 1);

    if (logs.length > 0) {
      actualStart = parseDate(logs[0].date);
      actualEnd = parseDate(logs[logs.length - 1].date);
      progress = planned > 0 ? Math.min(100, Math.floor(completed / planned * 100)) : 0;
      start = remaining <= 0 ? actualEnd : shift(actualEnd, 1);
      end = remaining <= 0 ? actualEnd : finish(start, remaining);
    } else if (completed > 0) {
      actualStart = process.completedDate ? parseDate(process.completedDate) : new Date(cursor);
      actualEnd = process.completedDate ? parseDate(process.completedDate) : null;
      progress = planned > 0 ? Math.min(100, Math.floor(completed / planned * 100)) : 0;
      start = actualEnd ? shift(actualEnd, 1) : onOrAfter(cursor);
      end = remaining <= 0 ? actualStart : finish(start, remaining);
    } else {
      start = onOrAfter(cursor);
      actualStart = start;
      end = finish(start, planned);
    }
    if (progress >= 100) actualEnd = end;
    previous = {
      id: process.id, name: process.processName,
      actualStart: dateKey(actualStart), actualEnd: actualEnd ? dateKey(actualEnd) : null,
      predictedStart: dateKey(start), predictedEnd: dateKey(end),
      progress, completedAmount: completed, remainingAmount: remaining,
    };
    cursor = shift(end, 1);
    return previous;
  });
}
