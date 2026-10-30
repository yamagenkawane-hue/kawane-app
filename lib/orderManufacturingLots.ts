export type ManufacturingLot = { id: string; lotNo: string; materialLotNo: string };
type LotRow = { id: string; post_id: string | null; lot_no: string | null; material_lot_no: string | null };
type ResultRow = { lot_id: string | null; post_id: string | null; order_process_id: string | null; amount: number | null };
type ProcessRow = { id: string; post_id: string | null; process_order: number | null };

/** A lot is confirmed by a positive result in the order's first manufacturing process. */
export function buildOrderManufacturingLots(lots: LotRow[], results: ResultRow[], processes: ProcessRow[]) {
  const firstProcess = new Map<string, ProcessRow>();
  const processMap = new Map(processes.map(row => [row.id, row]));
  for (const row of processes) {
    if (!row.post_id || row.process_order == null) continue;
    const current = firstProcess.get(row.post_id);
    if (!current || Number(row.process_order) < Number(current.process_order)) firstProcess.set(row.post_id, row);
  }
  const confirmed = new Set<string>();
  for (const row of results) {
    const process = row.order_process_id ? processMap.get(row.order_process_id) : undefined;
    const postId = row.post_id || process?.post_id;
    if (postId && row.lot_id && Number(row.amount) > 0 && process?.post_id === postId && firstProcess.get(postId)?.id === process.id) {
      confirmed.add(`${postId}:${row.lot_id}`);
    }
  }
  const grouped = new Map<string, ManufacturingLot[]>();
  const seen = new Set<string>();
  for (const row of lots) {
    if (!row.post_id || !row.lot_no?.trim() || seen.has(row.id) || !confirmed.has(`${row.post_id}:${row.id}`)) continue;
    seen.add(row.id);
    const list = grouped.get(row.post_id) || [];
    list.push({ id: row.id, lotNo: row.lot_no, materialLotNo: row.material_lot_no || "" });
    grouped.set(row.post_id, list);
  }
  for (const list of grouped.values()) list.sort((a,b) => a.lotNo.localeCompare(b.lotNo,"ja",{numeric:true}) || a.materialLotNo.localeCompare(b.materialLotNo,"ja",{numeric:true}) || a.id.localeCompare(b.id));
  return grouped;
}
