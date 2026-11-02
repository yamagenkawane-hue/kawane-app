export type ShipmentOrder = { id: string; order_no: string | null; order_amount: number | string | null; delete?: boolean | null };
type Shipment = { post_id: string | null; order_no: string | null; quantity: number | string | null; cancelled?: boolean | null };
type OutsourceProcess = { postId: string; orderNo: string };

/** Count active outsourced orders once, even when they contain several outsourced processes. */
export function summarizeOutsourceShipments(processes:OutsourceProcess[],orders:ShipmentOrder[],shipments:Shipment[]) {
  const activeOrders=orders.filter(order=>!order.delete);
  const byId=new Map(activeOrders.map(order=>[order.id,order]));
  const byNumber=new Map(activeOrders.filter(order=>order.order_no).map(order=>[order.order_no,order]));
  const targets=new Set<string>();
  for(const process of processes) {
    const order=process.postId?byId.get(process.postId):byNumber.get(process.orderNo);
    if(order) targets.add(order.id);
  }
  const amounts=new Map<string,number>();
  for(const shipment of shipments) {
    if(shipment.cancelled) continue;
    const order=shipment.post_id?byId.get(shipment.post_id):byNumber.get(shipment.order_no);
    const quantity=Number(shipment.quantity||0);
    if(order&&targets.has(order.id)&&Number.isFinite(quantity)&&quantity>0) amounts.set(order.id,(amounts.get(order.id)||0)+quantity);
  }
  let shipped=0;
  for(const id of targets) {
    const ordered=Number(byId.get(id)?.order_amount||0);
    if(ordered>0&&(amounts.get(id)||0)>=ordered) shipped++;
  }
  return {shipped,unshipped:targets.size-shipped};
}
