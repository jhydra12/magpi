import { drainIngestion, pendingCounts } from './seed-drain.mjs';
import { readAllPages } from './seed-source.mjs';

/** Drain existing source jobs for one organization using the deployed worker. */
export async function ingestSeed(
  client,
  orgId,
  {
    functionsUrl,
    serviceKey,
    fetcher = fetch,
    wait = () => new Promise((resolveWait) => setTimeout(resolveWait, 1000)),
  },
) {
  const snapshot = async () =>
    pendingCounts(
      await readAllPages(() =>
        client
          .from('ingest_jobs')
          .select('document_id,status')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      ),
    );
  await drainIngestion({
    snapshot,
    runBatch: async () => {
      const response = await fetcher(`${functionsUrl}/ingest-worker`, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: 25, org_id: orgId }),
      });
      if (!response.ok) throw new Error(`ingest worker returned ${response.status}`);
      const result = await response.json();
      console.log(`ingestion: ${result.claimed ?? 0} claimed`);
    },
    recoverStalled: async () => {
      const { error: sweepError } = await client.rpc('sweep_stale_worker_runs');
      if (sweepError)
        throw new Error(`Stalled ingestion could not be recovered: ${sweepError.message}`);
      console.log('ingestion: requeued a job whose worker did not come back');
    },
    wait,
  });
  console.log("Ingestion complete: every document's latest job succeeded.");
}
