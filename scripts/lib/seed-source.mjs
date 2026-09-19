const check = ({ data, error }, context) => {
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
};

/** Upsert bytes then atomically reconcile the document and its ingest job.
 * Replaying after an interrupted upload is safe. The worker compares processed hashes,
 * so unchanged content costs no embeddings while changed source bytes are ingested.
 */
export async function seedSource(db, { bucket, body, row }) {
  check(
    await db.storage
      .from(bucket)
      .upload(row.storage_path, body, { contentType: 'text/markdown', upsert: true }),
    'uploading source',
  );
  check(await db.rpc('enqueue_document', { p_document: row, p_force: true }), 'queueing source');
  return 'reconciled';
}

/** Read every page using a stable unique ordering supplied by the caller. */
export async function readAllPages(query, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = check(await query().range(offset, offset + pageSize - 1), 'reading page');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
