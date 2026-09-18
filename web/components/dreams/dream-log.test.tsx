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
  durationLabel: '2m 30s',
  documentsIngested: 12,
  connectionsMade: 3,
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
  it('shows one night as when, where, how long, what came in, and what was connected', () => {
    render(<DreamLog nights={[getNight()]} />);

    const row = screen.getByRole('row', { name: /17 Sept 2026/ });
    expect(row).toHaveTextContent('Engineering');
    expect(row).toHaveTextContent('2m 30s');
    expect(row).toHaveTextContent('12');
    expect(row).toHaveTextContent('3');
    expect(row).toHaveTextContent('Done');
  });

  it('names the columns a person asks about the morning after', () => {
    render(<DreamLog nights={[getNight()]} />);

    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Documents ingested' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Connections made' })).toBeInTheDocument();
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
