export type RetentionSettings = { detail_years: number; ai_years: number; prediction_days: number; updated_at?: string };
export function validateRetentionSettings(value: unknown, referenceDays: number): RetentionSettings {
  const input = value as Partial<RetentionSettings> | null;
  const detail = Number(input?.detail_years), ai = Number(input?.ai_years), prediction = Number(input?.prediction_days);
  if (![detail, ai, prediction].every(Number.isInteger) || detail < 1 || detail > 30 || ai < detail || ai > 30 || prediction < 30 || prediction > 3650) {
    throw new Error("業務履歴は1～30年、AI用実績は業務履歴以上で30年以内、AI予測記録は30～3650日で指定してください。");
  }
  if (ai * 365 < referenceDays) throw new Error("AI用実績の保存期間が、AI予測の最大参照期間より短くなっています。");
  return { detail_years: detail, ai_years: ai, prediction_days: prediction };
}

export type ArchivePacket = { version: number; post_id: string; anchors: Record<string, unknown>; tables: Record<string, Record<string, unknown>[]> };
export function parseArchivePacket(value: unknown): { export_id: string; payload: ArchivePacket } {
  const packet = value as { export_id?: unknown; payload?: ArchivePacket } | null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!packet || typeof packet.export_id !== "string" || !uuid.test(packet.export_id) || packet.payload?.version !== 1 || !uuid.test(packet.payload.post_id)) throw new Error("履歴退避ファイルの形式が不正です。");
  const expectedTables = ["production_results", "process_transfer_history", "outsource_remainder_schedules"];
  if (!packet.payload.tables || Object.keys(packet.payload.tables).length !== expectedTables.length) throw new Error("履歴退避ファイルの明細が不正です。");
  for (const table of expectedTables) {
    const rows = packet.payload.tables?.[table];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== "string" || !uuid.test(row.id))) throw new Error("履歴退避ファイルの明細が不正です。");
  }
  if (!packet.payload.anchors || typeof packet.payload.anchors !== "object") throw new Error("履歴退避ファイルの基本情報が不正です。");
  return { export_id: packet.export_id, payload: packet.payload };
}

/** Persisted samples replace deleted detail rows; IDs prevent double counting after restoration. */
export function mergeRetainedResults<T extends { id?: unknown }>(live: T[], retained: T[]) {
  return [...new Map([...retained, ...live].map(row => [String(row.id), row])).values()];
}
