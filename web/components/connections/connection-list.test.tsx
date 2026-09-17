import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ProviderListing } from '@/lib/connections/view-model';

import { ConnectionList } from './connection-list';

const getConnectionSummary = (
  overrides?: Partial<ProviderListing['connections'][number]>,
): ProviderListing['connections'][number] => ({
  id: 'conn-1',
  provider: 'notion',
  account: 'Acme workspace',
  destinations: ['Finance'],
  scope: '1 of 1 workspaces into 1 space',
  lastSynced: 'Synced 3 hours ago',
  status: {
    status: 'active',
    label: 'Connected',
    tone: 'positive',
    reason: 'Reading on the usual schedule.',
    recovery: { kind: 'resync', label: 'Sync now' },
  },
  selection: { kind: 'unset' },
  ...overrides,
});

const getListing = (overrides?: Partial<ProviderListing>): ProviderListing => ({
  slug: 'notion',
  displayName: 'Notion',
  description: 'Pages and databases.',
  docsUrl: 'https://developers.notion.com',
  scopeSelectionKind: 'workspace',
  enabled: true,
  connections: [getConnectionSummary()],
  ...overrides,
});

describe('the connections list', () => {
  it('names every provider and offers to add another connection under each', () => {
    render(
      <ConnectionList
        listings={[
          getListing(),
          getListing({ slug: 'slack', displayName: 'Slack', connections: [] }),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Notion' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Slack' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add another/i })).toHaveLength(2);
  });

  it('labels a connection by the spaces it feeds, with the account as the fallback', () => {
    render(
      <ConnectionList
        listings={[
          getListing({
            connections: [
              getConnectionSummary({ id: 'conn-1', destinations: ['Finance', 'Engineering'] }),
              getConnectionSummary({ id: 'conn-2', account: 'Personal notes', destinations: [] }),
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText('Finance, Engineering')).toBeInTheDocument();
    expect(screen.getByText('Personal notes')).toBeInTheDocument();
  });

  it('gives every connection a reconnect and a disconnect that do nothing yet', async () => {
    render(<ConnectionList listings={[getListing()]} />);

    const row = screen.getByRole('listitem');
    const reconnect = within(row).getByRole('button', { name: 'Reconnect' });
    const disconnect = within(row).getByRole('button', { name: 'Disconnect' });

    await userEvent.click(reconnect);
    await userEvent.click(disconnect);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
