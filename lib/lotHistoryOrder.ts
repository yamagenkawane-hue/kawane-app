import { isCalendarDate } from "@/lib/orderEntry";
type Row = Record<string, unknown>;
const positiveOrder = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

/** Prefer the current product route by ID; keep historical orders if a master was removed. */
export function createLotHistoryOrder(processes: Row[], master: Row[]) {
  const masterIds = new Map(master.map(p => [String(p.id), positiveOrder(p.process_order)]));
  const byId = new Map<string, number>();
  const byName = new Map<string, Set<number>>();
  for (const p of processes) {
    const order = masterIds.get(String(p.product_process_id)) ?? positiveOrder(p.process_order);
    if (order === undefined) continue;
    byId.set(String(p.id), order);
    const name = String(p.process_name || "");
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(order);
  }
  for (const p of master) {
    const order = positiveOrder(p.process_order);
    if (order === undefined) continue;
    const name = String(p.process_name || "");
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(order);
  }
  const resolve = (id: unknown, name: unknown, storedOrder?: unknown) => {
    const exact = byId.get(String(id));
    if (exact !== undefined) return exact;
    // A repeated process name cannot identify which stage was completed.
    const named = byName.get(String(name || ""));
    if (named?.size === 1) return [...named][0];
    return positiveOrder(storedOrder) ?? 0;
  };
  const orders = [...new Set([...byId.values(), ...master.map(p => positiveOrder(p.process_order)).filter((n): n is number => n !== undefined)])].sort((a,b) => a-b);
  return { resolve, last: Math.max(0, ...orders), previous: (to: number) => orders.filter(n => n < to).at(-1) ?? 0 };
}

export function sortLotHistory<T extends { id: string; date: string; processOrder?: number; eventOrder?: number; sortOrder: number }>(rows: T[]) {
  return [...rows].sort((a,b) => (b.processOrder ?? 0) - (a.processOrder ?? 0)
    || b.date.slice(0,10).localeCompare(a.date.slice(0,10))
    || (b.eventOrder ?? 0) - (a.eventOrder ?? 0)
    || b.date.localeCompare(a.date)
    || b.sortOrder - a.sortOrder || a.id.localeCompare(b.id));
}

/** A lot's own actual packaging results are authoritative. Never use update timestamps. */
export function lotPackagingCompletedDate(results: Row[], processes: Row[], storedDate: string) {
  const packagingIds = new Set(processes.filter(p => String(p.process_name || "").includes("梱包")).map(p => String(p.id)));
  const dates = results.filter(r => Number(r.amount) > 0 && (packagingIds.has(String(r.order_process_id)) || (!r.order_process_id && String(r.process_name || "").includes("梱包"))))
    .map(r => String(r.date || "")).filter(isCalendarDate).sort();
  return dates.at(-1) || (isCalendarDate(storedDate) ? storedDate : "");
}
