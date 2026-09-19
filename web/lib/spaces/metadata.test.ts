import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { loadSpaceMetadata } from './metadata';

function fixture(
  memberships = [
    { space_id: 'one', user_id: 'a' },
    { space_id: 'two', user_id: 'a' },
    { space_id: 'two', user_id: 'b' },
  ],
) {
  const client = {
    from(table: string) {
      let scope: readonly string[] = [];
      let from = 0;
      let to = 999;
      const query = {
        select() {
          return query;
        },
        in(_column: string, ids: readonly string[]) {
          scope = ids;
          return query;
        },
        order() {
          return query;
        },
        range(start: number, end: number) {
          from = start;
          to = end;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(
            table === 'documents'
              ? { count: scope.length * 4, error: null }
              : {
                  data: memberships
                    .filter((row) => scope.includes(row.space_id))
                    .slice(from, to + 1),
                  error: null,
                },
          ).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return client;
}

describe('space metadata', () => {
  it('counts people once across their spaces', async () => {
    expect(await loadSpaceMetadata(fixture(), ['one', 'two'])).toEqual({
      documentCount: 8,
      memberCount: 2,
    });
  });
  it('scopes both counts to selected spaces', async () => {
    expect(await loadSpaceMetadata(fixture(), ['one'])).toEqual({
      documentCount: 4,
      memberCount: 1,
    });
  });
  it('returns zero for an empty visible scope', async () => {
    expect(await loadSpaceMetadata(fixture(), [])).toEqual({ documentCount: 0, memberCount: 0 });
  });
});

it('counts members beyond one API page', async () => {
  const members = Array.from({ length: 1001 }, (_, i) => ({ space_id: 'one', user_id: String(i) }));
  expect((await loadSpaceMetadata(fixture(members), ['one'])).memberCount).toBe(1001);
});
