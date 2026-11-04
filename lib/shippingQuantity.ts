type Stock = { id: string; lot_id: string | null; current_stock: number | string | null; allocated_stock: number | string | null };
type Allocation = { post_id: string | null; inventory_item_id: string | null; allocated_amount: number | string | null; shipped_amount: number | string | null };

/** Unallocated stock plus this order's unshipped allocation, matching v_shipping_candidates. */
export function buildShippingStockMaps(items: Stock[], allocations: Allocation[]) {
  const freeByLot = new Map<string, number>();
  const ownByOrderLot = new Map<string, number>();
  const lotsByItem = new Map<string, string>();
  for (const item of items) {
    if (!item.lot_id) continue;
    lotsByItem.set(item.id, item.lot_id);
    freeByLot.set(item.lot_id, (freeByLot.get(item.lot_id) || 0)
      + Math.max(Number(item.current_stock || 0) - Number(item.allocated_stock || 0), 0));
  }
  for (const allocation of allocations) {
    const lotId = allocation.inventory_item_id && lotsByItem.get(allocation.inventory_item_id);
    if (!lotId || !allocation.post_id) continue;
    const key = `${allocation.post_id}:${lotId}`;
    ownByOrderLot.set(key, (ownByOrderLot.get(key) || 0)
      + Math.max(Number(allocation.allocated_amount || 0) - Number(allocation.shipped_amount || 0), 0));
  }
  return { freeByLot, ownByOrderLot };
}

export function shippingQuantityError(amount: number, orderRemaining: number, availableStock: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) {
    return "出荷数を1以上の整数で入力してください（上限2,147,483,647個）";
  }
  if (amount > orderRemaining) {
    return `この注文の注残は${orderRemaining.toLocaleString("ja-JP")}個です。今回の出荷数量は${Math.min(orderRemaining, availableStock).toLocaleString("ja-JP")}個以下で入力してください。`;
  }
  if (amount > availableStock) {
    return `このロットの出荷可能在庫は${availableStock.toLocaleString("ja-JP")}個です。今回の出荷数量は${availableStock.toLocaleString("ja-JP")}個以下で入力してください。`;
  }
  return "";
}
