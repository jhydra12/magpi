import { drainIngestion, pendingCounts } from './seed-drain.mjs';
import { readAllPages } from './seed-source.mjs';

/** Drain existing source jobs for one organization using the deployed worker. */
export async function ingestSeed(client, orgId, { functionsUrl, serviceKey }) {
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
      const response = await fetch(`${functionsUrl}/ingest-worker`, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: 25, org_id: orgId }),
      });
      if (!response.ok) throw new Error(`ingest worker returned ${response.status}`);
      const result = await response.json();
      console.log(`ingestion: ${result.claimed ?? 0} claimed`);
    },
    wait: () => new Promise((resolveWait) => setTimeout(resolveWait, 1000)),
  });
  console.log("Ingestion complete: every document's latest job succeeded.");
}
