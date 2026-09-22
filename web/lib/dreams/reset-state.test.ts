import { describe, expect, it } from 'vitest';

import { buildDemoResetDreamRuns } from './reset-state';

describe('the full demo reset Dream state', () => {
  it('places three timeouts before successful rows that finish one minute apart', () => {
    const rows = buildDemoResetDreamRuns(
      '11111111-1111-4111-8111-111111111111',
      ['one', 'two', 'three', 'four', 'five'],
      new Date('2026-09-22T19:45:00.000Z'),
    );

    expect(rows.map(({ status }) => status)).toEqual([
      'timeout',
      'timeout',
      'timeout',
      'succeeded',
      'succeeded',
    ]);
    const successes = rows.filter(({ status }) => status === 'succeeded');
    expect(successes.map(({ finished_at }) => finished_at)).toEqual([
      '2026-09-22T06:01:00.000Z',
      '2026-09-22T06:02:00.000Z',
    ]);
    expect(successes.map(({ started_at }) => started_at)).toEqual([
      '2026-09-22T06:00:30.000Z',
      '2026-09-22T06:01:30.000Z',
    ]);
    expect(
      Date.parse(successes.at(1)?.finished_at ?? '') -
        Date.parse(successes.at(0)?.finished_at ?? ''),
    ).toBeLessThan(300_000);
    expect(rows.filter(({ status }) => status === 'timeout')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: 'processing did not finish before the time limit' }),
      ]),
    );
  });

  it('keeps at least one successful row when only a few spaces exist', () => {
    const rows = buildDemoResetDreamRuns('org', ['one', 'two'], new Date('2026-09-22'));

    expect(rows.map(({ status }) => status)).toEqual(['timeout', 'succeeded']);
  });
});
