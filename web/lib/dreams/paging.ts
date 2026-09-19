/** Read every page without relying on the database API's maximum row setting. */
export async function readPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await read(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** Keep ID filters below URL limits while retaining every visible result. */
export async function readIdBatches<T>(
  ids: readonly string[],
  read: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    rows.push(...(await read(ids.slice(index, index + 100))));
  }
  return rows;
}
