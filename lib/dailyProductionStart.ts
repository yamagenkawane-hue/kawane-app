import { isCalendarDate } from "@/lib/orderEntry";

/** Unscheduled orders stay in backorders until their start date is entered and reached. */
export function hasProductionStarted(plannedStartDate: unknown, today: string): boolean {
  return typeof plannedStartDate === "string"
    && isCalendarDate(plannedStartDate)
    && plannedStartDate <= today;
}
