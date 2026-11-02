/** Completed quantity includes later dispatches: subtract only their moved quantity, not their scheduled quantity. */
export function outsourceInitialQuantity(completed: unknown, remainders: { moved_amount: unknown }[], archived = false): number | null {
  if (archived || completed === null || completed === undefined) return null;
  const total = Number(completed);
  const split = remainders.map(row => Number(row.moved_amount ?? 0));
  if (!Number.isFinite(total) || total < 0 || split.some(amount => !Number.isFinite(amount) || amount < 0)) return null;
  const initial = total - split.reduce((sum, amount) => sum + amount, 0);
  return initial > 0 ? initial : null;
}
