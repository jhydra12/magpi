import type { ConnectionSummary, ProviderListing } from '@/lib/connections/view-model';

import { SourceMark } from '@/components/brand/source-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The spaces a connection feeds, or the account when it is not routed anywhere yet. */
function rowLabel(connection: ConnectionSummary): string {
  return connection.destinations.length > 0
    ? connection.destinations.join(', ')
    : connection.account;
}

// Every button here is inert for now. Wiring comes back when the demo needs a live provider.
function ConnectionRow({ connection }: { connection: ConnectionSummary }) {
  return (
    <li className="-mx-1 flex items-center justify-between gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-muted motion-reduce:transition-none">
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {rowLabel(connection)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="sm">
          Reconnect
        </Button>
        <Button type="button" variant="ghost" size="sm">
          Disconnect
        </Button>
      </div>
    </li>
  );
}

function ProviderSection({ listing }: { listing: ProviderListing }) {
  const isLive = listing.connections.length > 0;

  return (
    <section className="py-4 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className={cn(
            'flex items-center gap-2.5 font-heading text-sm font-medium',
            isLive ? 'text-foreground' : 'text-tertiary-foreground',
          )}
        >
          <SourceMark source={listing.slug} className="size-5" fallback />
          {listing.displayName}
        </h2>
        <Button type="button" variant="ghost" size="sm">
          + Add another
        </Button>
      </div>

      {isLive ? (
        <ul className="mt-1">
          {listing.connections.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Providers as a list of rows, connected sources first so the scan path is the live ones. */
export function ConnectionList({ listings }: { listings: readonly ProviderListing[] }) {
  const live = listings.filter((listing) => listing.connections.length > 0);
  const rest = listings.filter((listing) => listing.connections.length === 0);

  return (
    <div className="flex flex-col divide-y divide-border">
      {live.map((listing) => (
        <ProviderSection key={listing.slug} listing={listing} />
      ))}
      {rest.map((listing) => (
        <ProviderSection key={listing.slug} listing={listing} />
      ))}
    </div>
  );
}
