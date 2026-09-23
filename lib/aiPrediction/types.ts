export type PredictionSettingsRow = {
  id: string;
  enabled: boolean;
  use_past_results: boolean;
  priority_reference_days: number;
  max_reference_days: number;
  manufacturing_min_business_days: number;
  other_process_min_lots: number;
  outsource_default_sent_offset_days: number;
  outsource_default_return_offset_days: number;
  validation_mode: boolean;
};

export type PredictionProcessInput = {
  postId: string;
  orderProcessId: string;
  orderNo: string;
  productName: string;
  deliveryDate: string;
  processName: string;
  processOrder: number;
  pressNumber: string | null;
  plannedStartDate: string | null;
  lastActualDate: string | null;
  allocatedAmount: number;
  producedLotAmount: number;
  plannedAmount: number;
  completedAmount: number;
  remainingAmount: number;
  completedDate: string | null;
  outsourcing: boolean;
  subcontractorName: string | null;
  outsourceSentDate: string | null;
  outsourceReturnedDate: string | null;
  referenceStartDate: string;
  historySampleCount: number;
  historyBusinessDays: number;
  historicalDailyAmount: number | null;
  historicalDurationDays: number | null;
  capacityDailyAmount: number | null;
  capacityOperationRate: number | null;
  sourceType: "gemini" | "capacity" | "actual" | "unavailable";
  comments: string[];
};

export type GeminiPrediction = {
  orderProcessId: string;
  durationDays: number;
  reason: string;
};

export type SavedPrediction = {
  post_id: string;
  order_process_id: string;
  order_no: string;
  process_name: string;
  process_order: number;
  predicted_start_date: string | null;
  predicted_end_date: string | null;
  source_type: "gemini" | "capacity" | "actual" | "unavailable";
  status: "predicted" | "confirmed" | "unavailable";
  reason: string;
  comments: string[];
  input_summary: Record<string, unknown>;
};
