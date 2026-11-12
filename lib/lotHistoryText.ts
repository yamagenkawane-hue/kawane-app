const systemReasons = new Map([
  ["Manufacturing result registered and moved automatically", "製造実績を登録し、次工程へ自動移動しました"],
  ["Progress screen transfer", "進捗管理から工程移動"],
]);

/** Translate known system messages only; retain entered notes and stored data. */
export function lotHistoryReasonText(value: unknown): string {
  const text = String(value ?? "");
  return systemReasons.get(text.trim()) ?? text;
}
