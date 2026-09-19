import { describe, expect, it } from 'vitest';

import { dreamRateLimitBuckets } from './rate-limit';

describe('demo reset rate limits', () => {
  it('targets the user and every space Dream bucket', () => {
    expect(dreamRateLimitBuckets('user-1', ['space-1', 'space-2'])).toEqual([
      'dream-run:user:user-1',
      'dream-run:space:space-1',
      'dream-run:space:space-2',
    ]);
  });
});
