import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DreamRunSummary } from '@/lib/dreams/view-model';

import { DreamRunList } from './dream-run-list';

const getSummary = (overrides?: Partial<DreamRunSummary>): DreamRunSummary => ({
  id: '11111111-2222-4333-8444-555555555555',
  kind: 'digest',
  inputDocumentCount: 42,
  spaceId: 'space-1',
  spaceName: 'Engineering',
  kindLabel: 'Digest',
  inputSummary: '42 documents',
  outputDocumentId: 'doc-1',
  duration: '1m 30s',
  createdAt: '2026-09-09T02:00:00.000Z',
  status: {
    status: 'succeeded',
    label: 'Succeeded',
    tone: 'positive',
    detail: 'The run finished and wrote its output.',
    stage: null,
  },
  ...overrides,
});

describe('the list of dream runs', () => {
  it('says what ran, where, over how many documents, and what came out', () => {
    render(<DreamRunList runs={[getSummary()]} />);

    expect(screen.getByRole('link', { name: 'Digest' })).toHaveAttribute(
      'href',
      '/dreams/11111111-2222-4333-8444-555555555555',
    );
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText(/42 documents read/)).toBeInTheDocument();
    expect(screen.getByText(/wrote one document/i)).toBeInTheDocument();
  });

  // A finished run is the ordinary case, so it carries no badge and no sentence about itself.
  it('says nothing about the status of a run that finished', () => {
    render(<DreamRunList runs={[getSummary()]} />);

    expect(screen.queryByText('Succeeded')).not.toBeInTheDocument();
    expect(screen.queryByText(/the run finished/i)).not.toBeInTheDocument();
  });

  it('names the stage a timed-out run died in, rather than showing it as still working', () => {
    render(
      <DreamRunList
        runs={[
          getSummary({
            status: {
              status: 'timeout',
              label: 'Timed out',
              tone: 'warning',
              detail: 'Timed out during synthesize. 900 documents exceeded the CPU budget.',
              stage: 'synthesize',
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText('Timed out')).toBeInTheDocument();
    expect(screen.getByText(/timed out during synthesize/i)).toBeInTheDocument();
  });

  it('shows a run that is still going as running, without a pulse', () => {
    render(
      <DreamRunList
        runs={[
          getSummary({
            duration: 'Still running',
            outputDocumentId: null,
            status: {
              status: 'running',
              label: 'Running',
              tone: 'progress',
              detail: 'Reading the space now.',
              stage: null,
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse, .motion-safe\\:animate-pulse')).toBeNull();
  });

  it('reads grammatically when a run read nothing at all', () => {
    render(
      <DreamRunList runs={[getSummary({ inputSummary: 'No documents', inputDocumentCount: 0 })]} />,
    );

    expect(screen.getByText(/No documents read/)).toBeInTheDocument();
  });

  it('says a run wrote nothing rather than leaving the column blank', () => {
    render(<DreamRunList runs={[getSummary({ outputDocumentId: null })]} />);

    expect(screen.getByText(/no output document/i)).toBeInTheDocument();
  });
});
