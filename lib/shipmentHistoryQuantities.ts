type Order = { id: string; order_no: string | null; order_amount: number | string | null };
type Shipment = { post_id: string | null; order_no: string | null; lot_id: string | null;
  idempotency_key: string | null; quantity: number | string | null; cancelled: boolean | null };
type Closure = { id: string; post_id: string | null; order_no: string; order_amount: number | string; shipped_amount: number | string };

/** Current order/shipment totals plus the historical quantity shipped by this particular cutoff. */
export function addShipmentHistoryQuantities<T extends Closure>(closures: T[], orders: Order[], shipments: Shipment[]) {
  const byId = new Map(orders.map(order => [order.id, order]));
  const byNumber = new Map(orders.map(order => [order.order_no, order]));
  const closuresById = new Map(closures.map(closure => [closure.id, closure]));
  const totals = new Map<string, number>();
  const cutoffTotals = new Map<string, number>();
  for (const shipment of shipments) {
    const postId = shipment.post_id || byNumber.get(shipment.order_no)?.id;
    const amount = Number(shipment.quantity || 0);
    if (!postId || !Number.isFinite(amount) || amount < 0) continue;
    if (!shipment.cancelled) totals.set(postId, (totals.get(postId) || 0) + amount);
    const [kind, closureId, lotId, extra] = (shipment.idempotency_key || "").split(":");
    const closure = closuresById.get(closureId);
    const closurePostId = closure?.post_id || (closure && byNumber.get(closure.order_no)?.id);
    if (kind === "cutoff" && !extra && lotId === shipment.lot_id && closurePostId === postId) {
      // Keep the quantity at cutoff time even after its shipment is cancelled by restoration.
      cutoffTotals.set(closureId, (cutoffTotals.get(closureId) || 0) + amount);
    }
  }
  return closures.map(closure => {
    const order = closure.post_id ? byId.get(closure.post_id) : byNumber.get(closure.order_no);
    return { ...closure, order_amount: order ? Number(order.order_amount || 0) : Number(closure.order_amount),
      shipped_amount: order ? totals.get(order.id) || 0 : Number(closure.shipped_amount),
      latest_shipped_quantity: cutoffTotals.get(closure.id) || 0 };
  });
}
