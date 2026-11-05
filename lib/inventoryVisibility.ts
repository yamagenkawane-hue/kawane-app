type InventoryQuantity = { currentStock: number; allocatedStock: number };

export function availableInventoryQuantity(item: InventoryQuantity) {
  const current = Number(item.currentStock);
  const allocated = Number(item.allocatedStock);
  if (!Number.isFinite(current) || !Number.isFinite(allocated)) return 0;
  return Math.max(current - allocated, 0);
}

export function isInventoryVisible(item: InventoryQuantity) {
  return availableInventoryQuantity(item) > 0;
}
