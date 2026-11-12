const defaultProcessLabels = ["製造", "プレス", "洗浄", "検査", "品質管理", "計量", "梱包", "出荷", "梱包出荷", "外注", "加工", "製造G", "品質管理G", "梱包出荷G"];
const key = (text: string) => text.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();

/** A process/department label is not a machine number. Preserve actual identifiers. */
export function pressMachineNumber(value: unknown, processNames: readonly string[] = []): string {
  const text = String(value ?? "").trim();
  const labels = new Set([...defaultProcessLabels, ...processNames].map(key));
  return labels.has(key(text)) ? "" : text;
}
