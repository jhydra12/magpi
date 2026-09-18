import { describe, expect, it } from 'vitest';

import { getActivityRun } from '@/components/dreams/activity-test-fixtures';

import { measureDreamBatch } from './activity';

const observedAt = '2026-09-18T10:01:00.000Z';

describe('measured Dream batch progress', () => {
  it('counts remaining work and elapsed time from earliest submission, including queued time', () => {
    expect(
      measureDreamBatch({
        observedAt,
        runs: [
          getActivityRun({ created_at: '2026-09-18T10:00:10.000Z' }),
          getActivityRun({
            status: 'running',
            created_at: '2026-09-18T09:59:30.000Z',
            started_at: '2026-09-18T10:00:20.000Z',
          }),
          getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:00:50.000Z' }),
        ],
      }),
    ).toEqual({ remaining: 2, elapsedMs: 90_000, completedInLast30Seconds: 1 });
  });

  it('freezes elapsed time at the final finish, including failed jobs', () => {
    const runs = [
      getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:00:20.000Z' }),
      getActivityRun({ status: 'timeout', finished_at: '2026-09-18T10:00:45.000Z' }),
    ];
    expect(measureDreamBatch({ observedAt, runs })).toEqual({
      remaining: 0,
      elapsedMs: 45_000,
      completedInLast30Seconds: 0,
    });
    expect(measureDreamBatch({ observedAt: '2026-09-18T12:00:00.000Z', runs }).elapsedMs).toBe(
      45_000,
    );
  });

  it('counts only successful finishes within the observed rolling window', () => {
    const runs = [
      getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:00:30.000Z' }),
      getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:00:30.001Z' }),
      getActivityRun({ status: 'succeeded', finished_at: observedAt }),
      getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:01:01.000Z' }),
      getActivityRun({ status: 'failed', finished_at: '2026-09-18T10:00:50.000Z' }),
      getActivityRun({ status: 'succeeded', finished_at: null }),
    ];
    expect(measureDreamBatch({ observedAt, runs }).completedInLast30Seconds).toBe(2);
  });

  it('does not invent elapsed time for an empty batch or missing terminal timestamps', () => {
    expect(measureDreamBatch({ observedAt, runs: [] })).toEqual({
      remaining: 0,
      elapsedMs: null,
      completedInLast30Seconds: 0,
    });
    expect(
      measureDreamBatch({ observedAt, runs: [getActivityRun({ status: 'failed' })] }).elapsedMs,
    ).toBeNull();
  });
});
