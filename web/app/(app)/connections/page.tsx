import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { ConnectionClaim } from '@/components/connections/connection-claim';
import { ConnectionList } from '@/components/connections/connection-list';
import { SyncActivity } from '@/components/connections/sync-activity';
import { UploadDialog } from '@/components/documents/upload-dialog';
import { loadConnectionsPage } from '@/lib/connections/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { claimPendingConnection } from './actions';

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; provider?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const [{ listings, spaceIds, spaces }, query] = await Promise.all([
    loadConnectionsPage(context),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Connections"
        description="Ingest data automatically from your systems of record"
      />

      {query.ticket && query.provider ? (
        <ConnectionClaim
          provider={query.provider}
          ticket={query.ticket}
          onClaim={claimPendingConnection}
        />
      ) : null}

      <SyncActivity spaceIds={spaceIds} />

      {listings.length > 0 ? (
        <ConnectionList listings={listings} />
      ) : (
        <EmptyState
          title="No sources are available"
          description="No providers are enabled on this deployment."
        />
      )}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-border px-4 py-4">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-medium text-foreground">
            Upload documents manually
          </h2>
          <p className="mt-0.5 max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
            Ingest documents in bulk from your machine.
          </p>
        </div>

        <UploadDialog spaces={spaces} />
      </section>
    </>
  );
}
