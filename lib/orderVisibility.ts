type Order = { id: string; order_no: string | null; order_amount: number | string | null; delete?: boolean | null; shipment_closed_at?: string | null };
type Shipment = { post_id: string | null; order_no: string | null; quantity: number | string | null; cancelled?: boolean | null };

export function buildShippedAmountMap(orders: Pick<Order, "id" | "order_no">[], shipments: Shipment[]) {
  const byId = new Set(orders.map(order => order.id));
  const result = new Map<string, number>();
  for (const shipment of shipments) {
    if (shipment.cancelled) continue;
    const id = shipment.post_id || orders.find(order => order.order_no === shipment.order_no)?.id;
    const amount = Number(shipment.quantity || 0);
    if (id && byId.has(id) && Number.isFinite(amount)) result.set(id, (result.get(id) || 0) + amount);
  }
  return result;
}

export function outstandingOrderIds(orders: Order[], shipments: Shipment[]) {
  const amounts = buildShippedAmountMap(orders, shipments);
  return new Set(orders.filter(order => !order.delete && !order.shipment_closed_at && (amounts.get(order.id) || 0) < Number(order.order_amount || 0)).map(order => order.id));
}
