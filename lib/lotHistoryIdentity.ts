/** Explicit UUID wins. Legacy labels may be used only within one unambiguous order. */
export function lotHistoryBelongsTo(
  row: { lot_id?: unknown; post_id?: unknown; lot_no?: unknown },
  lot: { id: string; postId: string; lotNo: string },
  legacyIsUnambiguous: boolean,
): boolean {
  if (row.lot_id) return row.lot_id === lot.id;
  return legacyIsUnambiguous && Boolean(lot.postId) && row.post_id === lot.postId && row.lot_no === lot.lotNo;
}
