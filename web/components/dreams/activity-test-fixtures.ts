import type { DreamActivityRun, DreamActivitySnapshot } from '@/lib/dreams/activity';

export const RUN_ID = '11111111-2222-4333-8444-555555555555';
export const getActivityRun = (overrides: Partial<DreamActivityRun> = {}): DreamActivityRun => ({
  id: RUN_ID,
  space_id: '33333333-3333-4333-8333-333333333333',
  kind: 'digest',
  status: 'queued',
  created_at: '2026-09-18T10:00:00.000Z',
  started_at: null,
  finished_at: null,
  input_document_count: 0,
  output_document_id: null,
  error: null,
  ...overrides,
});

export const getSnapshot = (overrides: Partial<DreamActivityRun> = {}): DreamActivitySnapshot => ({
  runs: [getActivityRun(overrides)],
  observedAt: '2026-09-18T10:00:10.000Z',
});
