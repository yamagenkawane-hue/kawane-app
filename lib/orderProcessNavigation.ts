export function orderProcessesHref(postId: string, orderNo: string) {
  const params = new URLSearchParams();
  if (postId) params.set("postId", postId);
  if (orderNo) params.set("orderNo", orderNo);
  return `/orderProcesses${params.size ? `?${params}` : ""}`;
}

/** IDs take priority; never silently select a different order when an ID is missing. */
export function findRequestedOrder<T extends { id: string; orderNo: string }>(posts: T[], postId: string, orderNo: string) {
  return postId ? posts.find(post => post.id === postId) : orderNo ? posts.find(post => post.orderNo === orderNo) : undefined;
}
