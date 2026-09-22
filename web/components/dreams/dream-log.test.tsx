import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { NightlyDream } from '@/lib/dreams/nightly';

import { DreamLog } from './dream-log';

const getNight = (overrides?: Partial<NightlyDream>): NightlyDream => ({
  id: 'space-1|2026-09-17',
  night: '2026-09-17',
  nightLabel: 'Last night',
  spaceId: 'space-1',
  spaceName: 'Engineering',
  startedBy: 'Nightly',
  durationLabel: '2m 30s',
  documentsIngested: 12,
  connectionsFound: 3,
  connectionsConfirmed: 1,
  modelTokens: 515_869,
  output: { id: 'doc-1', title: 'Digest for 2026-09-17' },
  runs: [
    {
      id: '11111111-2222-4333-8444-555555555551',
      kind: 'entities',
      kindLabel: 'Entities',
      status: {
        status: 'succeeded',
        label: 'Succeeded',
        tone: 'positive',
        detail: '',
        stage: null,
      },
    },
    {
      id: '11111111-2222-4333-8444-555555555552',
      kind: 'digest',
      kindLabel: 'Digest',
      status: {
        status: 'succeeded',
        label: 'Succeeded',
        tone: 'positive',
        detail: '',
        stage: null,
      },
    },
  ],
  status: { label: 'Done', tone: 'positive', detail: null },
  ...overrides,
});

describe('the dream log', () => {
  it('shows one night as when, where, who, how long, what came in, what it spent and connected', () => {
    render(<DreamLog nights={[getNight()]} />);

    const row = screen.getByRole('listitem', { name: /Last night/ });
    expect(row).toHaveTextContent('Engineering');
    expect(row).toHaveTextContent('Started by Nightly');
    expect(row).toHaveTextContent('2m 30s');
    expect(row).toHaveTextContent('12');
    expect(row).toHaveTextContent('documents ingested');
    expect(row).not.toHaveTextContent('found');
    expect(row).not.toHaveTextContent('confirmed');
    expect(row).toHaveTextContent('516k model tokens');
    expect(row).toHaveTextContent('Done');
  });

  it('answers the morning-after questions on the night itself', () => {
    render(<DreamLog nights={[getNight()]} />);

    const row = screen.getByRole('listitem', { name: /Last night/ });
    expect(row).toHaveTextContent('Started by Nightly');
    expect(row).toHaveTextContent('2m 30s');
    expect(row).toHaveTextContent('documents ingested');
    expect(row).toHaveTextContent('model tokens');
    expect(screen.getByRole('link', { name: 'Digest' })).toBeInTheDocument();
  });

  it('links only to the digest pass', () => {
    render(<DreamLog nights={[getNight()]} />);

    expect(screen.getByRole('link', { name: 'Digest' })).toHaveAttribute(
      'href',
      '/dreams/11111111-2222-4333-8444-555555555552',
    );
    expect(screen.queryByRole('link', { name: 'Entities' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('leaves the spend column out for a reader who cannot see model calls', () => {
    render(<DreamLog nights={[getNight({ modelTokens: null })]} />);

    expect(screen.queryByText(/model tokens/)).not.toBeInTheDocument();
  });

  it('says which pass died and why, rather than showing the night as done', () => {
    render(
      <DreamLog
        nights={[
          getNight({
            status: {
              label: 'Digest timed out',
              tone: 'warning',
              detail: 'Timed out during synthesize. 900 documents exceeded the CPU budget.',
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText('Digest timed out')).toBeInTheDocument();
    expect(screen.getByText(/timed out during synthesize/i)).toBeInTheDocument();
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });

  it('lists nights in the order given, so the newest stays on top', () => {
    render(
      <DreamLog
        nights={[
          getNight({ id: 'a', nightLabel: 'Last night' }),
          getNight({ id: 'b', nightLabel: '2 nights ago' }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Last night');
    expect(rows[1]).toHaveTextContent('2 nights ago');
  });
});
