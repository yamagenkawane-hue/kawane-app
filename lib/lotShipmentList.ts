export type ShipmentState = "unshipped" | "partial" | "completed";
type Lot = { id: string; postId: string; orderNo: string; flowStatus: string; shippedAmount: number };
type Order = { id: string; order_no: string | null; order_amount: number | string | null; delivery_date: string | null; shipment_closed_at: string | null };
type Shipment = { post_id: string | null; order_no: string | null; lot_id: string | null; quantity: number | string | null; created_at: string | null; cancelled: boolean | null };
const timestamp = (value: string) => Date.parse(value) || 0;

/** Order IDs take precedence; legacy order numbers must identify exactly one order. */
export function enrichLotShipmentList<T extends Lot>(lots: T[], orders: Order[], shipments: Shipment[]) {
  const byId = new Map(orders.map(order => [order.id, order]));
  const byNumber = new Map<string, Order[]>();
  for (const order of orders) {
    if (!order.order_no) continue;
    byNumber.set(order.order_no, [...(byNumber.get(order.order_no) || []), order]);
  }
  const totals = new Map<string, { quantity: number; latest: string }>();
  for (const shipment of shipments) {
    if (shipment.cancelled) continue;
    const matches = shipment.order_no ? byNumber.get(shipment.order_no) : undefined;
    const postId = shipment.post_id || (matches?.length === 1 ? matches[0].id : "");
    const keys = [postId ? `post:${postId}` : "", shipment.lot_id ? `lot:${shipment.lot_id}` : ""].filter(Boolean);
    for (const key of keys) {
      const total = totals.get(key) || { quantity: 0, latest: "" };
      const quantity = Number(shipment.quantity || 0);
      if (Number.isFinite(quantity)) total.quantity += quantity;
      const date = shipment.created_at || "";
      if (timestamp(date) > timestamp(total.latest)) total.latest = date;
      totals.set(key, total);
    }
  }
  return lots.map(lot => {
    const order = byId.get(lot.postId);
    const total = totals.get(order ? `post:${order.id}` : `lot:${lot.id}`);
    const shipped = total?.quantity || 0;
    const completed = order
      ? Boolean(order.shipment_closed_at) || (Number(order.order_amount) > 0 && shipped >= Number(order.order_amount))
      : lot.flowStatus === "shipped";
    const shipmentState: ShipmentState = completed ? "completed" : (order ? shipped : lot.shippedAmount) > 0 ? "partial" : "unshipped";
    return { ...lot, shipmentState, lastShippedAt: total?.latest || "", deliveryDate: order?.delivery_date || "" };
  });
}

export function compareLotShipmentRows(
  a: { id: string; orderNo: string; lastShippedAt: string; deliveryDate: string },
  b: { id: string; orderNo: string; lastShippedAt: string; deliveryDate: string },
) {
  return timestamp(b.lastShippedAt) - timestamp(a.lastShippedAt)
    || (timestamp(a.deliveryDate) || Infinity) - (timestamp(b.deliveryDate) || Infinity)
    || a.orderNo.localeCompare(b.orderNo, "ja", { numeric: true })
    || a.id.localeCompare(b.id);
}
