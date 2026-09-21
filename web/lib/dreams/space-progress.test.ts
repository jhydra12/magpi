import { describe, expect, it } from 'vitest';

import { getActivityRun } from '@/components/dreams/activity-test-fixtures';

import { summarizeSpaceDream } from './space-progress';

const DIGEST_ID = '11111111-2222-4333-8444-555555555555';
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666';

const succeededDigest = () =>
  getActivityRun({
    id: DIGEST_ID,
    kind: 'digest',
    status: 'succeeded',
    started_at: '2026-09-18T10:00:00.000Z',
    finished_at: '2026-09-18T10:00:05.000Z',
    output_document_id: DOCUMENT_ID,
  });

describe('the digest a space row can link to', () => {
  it('reports the digest when its sibling tasks failed', () => {
    const summary = summarizeSpaceDream([
      succeededDigest(),
      getActivityRun({
        id: '44444444-4444-4444-8444-444444444444',
        kind: 'connections',
        status: 'failed',
        started_at: '2026-09-18T10:00:00.000Z',
        finished_at: '2026-09-18T10:00:04.000Z',
        error: 'the model returned nothing',
      }),
    ]);

    expect(summary?.run.status).toBe('failed');
    expect(summary?.digestRunId).toBe(DIGEST_ID);
  });

  it('reports no digest when the digest task itself failed', () => {
    const summary = summarizeSpaceDream([
      getActivityRun({
        kind: 'digest',
        status: 'failed',
        started_at: '2026-09-18T10:00:00.000Z',
        finished_at: '2026-09-18T10:00:04.000Z',
      }),
    ]);

    expect(summary?.digestRunId).toBeNull();
  });

  it('reports no digest when a succeeded digest wrote no document', () => {
    const summary = summarizeSpaceDream([
      getActivityRun({ kind: 'digest', status: 'succeeded', output_document_id: null }),
    ]);

    expect(summary?.digestRunId).toBeNull();
  });

  it('reports no digest while the digest is still running', () => {
    const summary = summarizeSpaceDream([
      getActivityRun({ kind: 'digest', status: 'running', started_at: '2026-09-18T10:00:00.000Z' }),
    ]);

    expect(summary?.digestRunId).toBeNull();
  });
});
