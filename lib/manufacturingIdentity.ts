type OrderIdentity = { id: string; orderNo?: string; productId?: string; productName?: string };
type ScheduleIdentity = { id: string; postId?: string; orderNo?: string; productId?: string; productName?: string };

/** A lot number is a label, never an order identifier. Ambiguous legacy data stays unselected. */
export function manufacturingPostId(schedule: ScheduleIdentity, posts: OrderIdentity[]): string {
  const postId = schedule.postId || (schedule.id.startsWith("post:") ? schedule.id.slice(5) : "");
  const candidates = postId
    ? posts.filter((post) => post.id === postId)
    : posts.filter((post) => Boolean(schedule.orderNo) && post.orderNo === schedule.orderNo);
  if (candidates.length !== 1) return "";
  const post = candidates[0];
  if (schedule.productId && post.productId) {
    if (schedule.productId !== post.productId) return "";
  } else if (schedule.productName && post.productName && schedule.productName !== post.productName) {
    return "";
  }
  return post.id;
}

export function productionResultErrorComment(error: unknown, lotNo: string): string {
  const fields = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const message = String(fields.message || "");
  if (String(fields.code || "") === "23505" && message.includes("lots_post_lot_material_unique_idx")) {
    return `コメント: この注番のロットNo「${lotNo}」と材料ロットNoの組み合わせは登録済みです。画面を再読み込みして確認してください。`;
  }
  if (String(fields.code || "") === "23505") {
    return "コメント: 登録内容が既存データと重複しています。画面を再読み込みして確認してください。";
  }
  return message ? `コメント: ${message}` : "コメント: 製造実績の登録に失敗しました。入力内容を確認してください。";
}
