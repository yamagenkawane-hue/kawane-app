// Bump when saved predictions are incompatible with the current date semantics.
export const PREDICTION_DATE_VERSION = 2;

export function actualDate(value: unknown): string | null {
  const day = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function processActuals(
  planned: number,
  recordedAmount: number,
  recordedDate: unknown,
  results: { date: unknown; amount: number }[],
) {
  const completed = Math.max(recordedAmount, results.reduce((sum, row) => sum + row.amount, 0));
  const remaining = Math.max(0, planned - completed);
  const dated = results.filter(row => row.amount > 0 && actualDate(row.date));
  const dates = dated.map(row => actualDate(row.date)!).sort();
  // A partial log cannot establish when the entire quantity was completed.
  const covered = dated.reduce((sum, row) => sum + row.amount, 0) >= completed;
  const recorded = actualDate(recordedDate);
  const last = [...dates, ...(recorded ? [recorded] : [])].sort().at(-1) || null;
  const completionDate = remaining === 0
    ? recorded ? last : (covered ? dates.at(-1) || null : null)
    : null;
  return {
    completed, remaining, completionDate,
    actualStart: dates[0] || actualDate(recordedDate),
    actualEnd: last,
  };
}

export function predictionMatchesActuals(
  input: Record<string, unknown> | undefined,
  registeredPlannedAmount: number,
  orderAmount: number,
  recordedAmount: number,
  recordedDate: unknown,
  results: { date: unknown; amount: number }[],
) {
  if (!input || input.dateVersion !== PREDICTION_DATE_VERSION ||
      Number(input.registeredPlannedAmount) !== registeredPlannedAmount ||
      Number(input.orderAmount) !== orderAmount) return false;
  const facts = processActuals(Number(input.plannedAmount), recordedAmount, recordedDate, results);
  const last = results.map(row => actualDate(row.date)).filter((date): date is string => Boolean(date)).sort().at(-1) || null;
  return Number(input.completedAmount) === facts.completed &&
    input.completedDate === facts.completionDate && input.lastActualDate === last;
}
