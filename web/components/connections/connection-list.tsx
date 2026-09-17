import type { ConnectionSummary, ProviderListing } from '@/lib/connections/view-model';

import { SourceMark } from '@/components/brand/source-mark';
import { Button } from '@/components/ui/button';

/** The spaces a connection feeds, or the account when it is not routed anywhere yet. */
function rowLabel(connection: ConnectionSummary): string {
  return connection.destinations.length > 0
    ? connection.destinations.join(', ')
    : connection.account;
}

// Every button here is inert for now. Wiring comes back when the demo needs a live provider.
function ConnectionRow({ connection }: { connection: ConnectionSummary }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="min-w-0 truncate text-sm text-foreground">{rowLabel(connection)}</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm">
          Reconnect
        </Button>
        <Button type="button" variant="ghost" size="sm">
          Disconnect
        </Button>
      </div>
    </li>
  );
}

/** Providers as a list of rows, one section per provider. */
export function ConnectionList({ listings }: { listings: readonly ProviderListing[] }) {
  return (
    <div className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {listings.map((listing) => (
        <section key={listing.slug} className="px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-heading text-sm font-medium text-foreground">
              <SourceMark source={listing.slug} className="size-5" fallback />
              {listing.displayName}
            </h2>
            <Button type="button" variant="outline" size="sm">
              + Add another
            </Button>
          </div>

          {listing.connections.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {listing.connections.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} />
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
