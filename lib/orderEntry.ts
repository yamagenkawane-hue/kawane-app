import type { CustomerMaster, ProductMaster } from "@/app/type";

export function productsForCustomer(products: ProductMaster[], customers: CustomerMaster[], customerId: string) {
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) return [];
  return products.filter((product) => product.customerId
    ? product.customerId === customer.id
    : product.customerName === customer.customerName && customers.filter((item) => item.customerName === customer.customerName).length === 1);
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function completionDateForCustomer(deliveryDate: string, customer?: CustomerMaster): string {
  if (!isCalendarDate(deliveryDate) || !customer) return "";
  const date = new Date(`${deliveryDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Number(customer.shippingOffsetDays || 0));
  return date.toISOString().slice(0, 10);
}

export function plannedStartDateError(start: string, completion?: string, delivery?: string): string {
  if (!start) return "";
  if (!isCalendarDate(start)) return "開始予定日を正しい日付で入力してください";
  if (completion && start > completion) return "開始予定日は完了予定日以前にしてください";
  if (delivery && start > delivery) return "開始予定日は納期以前にしてください";
  return "";
}

/** Explicit order/schedule dates take precedence; keep the pre-existing AI fallback for old schedules. */
export function manufacturingPlannedStart(...values: unknown[]): string | null {
  for (const value of values) {
    const day = typeof value === "string" ? value.slice(0, 10) : "";
    if (isCalendarDate(day)) return day;
  }
  return null;
}
