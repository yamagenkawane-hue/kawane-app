/** Use a stable, unique order in buildQuery to avoid the REST row limit. */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await buildQuery(offset, offset + 999);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return { data: rows, error: null };
  }
}
