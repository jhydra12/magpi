/** Drain only this organization's ingestion, failing rather than declaring partial success. */
export async function drainIngestion({
  snapshot,
  runBatch,
  wait,
  recoverStalled = async () => {},
  maxPasses = 200,
}) {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const counts = await snapshot();
    if (counts.failed || counts.timeout)
      throw new Error(`Ingestion failed: ${JSON.stringify(counts)}`);
    if (!counts.queued && !counts.running) return counts;
    // Nothing queued but something running means the claim has nothing to take, and it only
    // reclaims an abandoned job after fifteen minutes, which outlasts these passes.
    if (!counts.queued && counts.running) await recoverStalled();
    await runBatch();
    // Queued retries and jobs owned by another worker can temporarily claim nothing.
    await wait();
  }
  const remaining = await snapshot();
  if (Object.values(remaining).some((count) => count > 0)) {
    throw new Error(`Ingestion incomplete after ${maxPasses} passes: ${JSON.stringify(remaining)}`);
  }
  return remaining;
}

/** Historical failed attempts are resolved by a later job for the same document. */
export function pendingCounts(jobsNewestFirst) {
  const latest = new Map();
  for (const job of jobsNewestFirst) {
    if (!latest.has(job.document_id)) latest.set(job.document_id, job);
  }
  const counts = { queued: 0, running: 0, failed: 0, timeout: 0 };
  for (const { status } of latest.values()) {
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }
  return counts;
}
