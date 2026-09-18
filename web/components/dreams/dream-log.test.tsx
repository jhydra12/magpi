import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { NightlyDream } from '@/lib/dreams/nightly';

import { DreamLog } from './dream-log';

const getNight = (overrides?: Partial<NightlyDream>): NightlyDream => ({
  id: 'space-1|2026-09-17',
  night: '2026-09-17',
  nightLabel: '17 Sept 2026',
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

    const row = screen.getByRole('row', { name: /17 Sept 2026/ });
    expect(row).toHaveTextContent('Engineering');
    expect(row).toHaveTextContent('Nightly');
    expect(row).toHaveTextContent('2m 30s');
    expect(row).toHaveTextContent('12');
    expect(row).toHaveTextContent('3 found, 1 confirmed');
    expect(row).toHaveTextContent('516k');
    expect(row).toHaveTextContent('Done');
  });

  it('names the columns a person asks about the morning after', () => {
    render(<DreamLog nights={[getNight()]} />);

    for (const name of [
      'Started by',
      'Time',
      'Documents ingested',
      'Connections made',
      'Model tokens',
      'Wrote',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('links to the document the night wrote', () => {
    render(<DreamLog nights={[getNight()]} />);

    expect(screen.getByRole('link', { name: 'Digest for 2026-09-17' })).toHaveAttribute(
      'href',
      '/documents/doc-1',
    );
  });

  it('says a night wrote nothing rather than leaving the cell blank', () => {
    render(<DreamLog nights={[getNight({ output: null })]} />);

    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });

  it('links to each pass of the night', () => {
    render(<DreamLog nights={[getNight()]} />);

    expect(screen.getByRole('link', { name: 'Digest' })).toHaveAttribute(
      'href',
      '/dreams/11111111-2222-4333-8444-555555555552',
    );
    expect(screen.getByRole('link', { name: 'Entities' })).toHaveAttribute(
      'href',
      '/dreams/11111111-2222-4333-8444-555555555551',
    );
  });

  it('leaves the spend column out for a reader who cannot see model calls', () => {
    render(<DreamLog nights={[getNight({ modelTokens: null })]} />);

    expect(screen.queryByRole('columnheader', { name: 'Model tokens' })).not.toBeInTheDocument();
  });

  it('reads a night with no connections as a plain zero', () => {
    render(<DreamLog nights={[getNight({ connectionsFound: 0, connectionsConfirmed: 0 })]} />);

    expect(screen.getByRole('cell', { name: '0' })).toBeInTheDocument();
    expect(screen.queryByText(/found/)).not.toBeInTheDocument();
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
          getNight({ id: 'a', nightLabel: '18 Sept 2026' }),
          getNight({ id: 'b', nightLabel: '17 Sept 2026' }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('18 Sept 2026');
    expect(rows[1]).toHaveTextContent('17 Sept 2026');
  });
});
