import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';

import {
  describeKind,
  listSpaceOptions,
  listVisibleSpaces,
  sortSpaces,
  type SpaceKind,
} from './spaces';

const space = (overrides: Partial<{ id: string; name: string; kind: SpaceKind }> = {}) => ({
  id: 'space-1',
  name: 'Personal',
  kind: 'personal' as SpaceKind,
  ...overrides,
});

describe('space ordering', () => {
  it('puts personal first, then the org space, then teams', () => {
    const ordered = sortSpaces([
      space({ id: 'a', name: 'Growth', kind: 'team' }),
      space({ id: 'b', name: 'Everyone', kind: 'org' }),
      space({ id: 'c', name: 'Personal', kind: 'personal' }),
    ]);

    expect(ordered.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders teams alphabetically so the selector never reshuffles', () => {
    const ordered = sortSpaces([
      space({ id: 'a', name: 'Zebra', kind: 'team' }),
      space({ id: 'b', name: 'Apples', kind: 'team' }),
    ]);

    expect(ordered.map((s) => s.name)).toEqual(['Apples', 'Zebra']);
  });

  it('leaves the input array alone', () => {
    const input = [space({ id: 'a', kind: 'team' }), space({ id: 'b', kind: 'personal' })];
    sortSpaces(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('space descriptions', () => {
  it("says who can see each kind of space in the user's own terms", () => {
    expect(describeKind('personal')).toBe('Only you');
    expect(describeKind('team')).toBe('The people you add');
    expect(describeKind('org')).toBe('Organization space');
  });
});

type SpacesResponse = {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
};

/** Stands in for the spaces table, recording the columns each call asks for. */
function spacesTable(response: SpacesResponse): {
  supabase: SupabaseClient<Database>;
  asked: string[];
} {
  const asked: string[] = [];

  const supabase = {
    from: () => ({
      select: (columns: string) => {
        asked.push(columns);
        return Promise.resolve(response);
      },
    }),
  } as unknown as SupabaseClient<Database>;

  return { supabase, asked };
}

const spaceRow = (
  overrides: Partial<{
    id: string;
    name: string;
    kind: SpaceKind;
    dreaming_enabled: boolean;
    space_members: { count: number }[] | null;
    documents: { count: number }[] | null;
  }> = {},
) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Personal',
  kind: 'personal' as SpaceKind,
  dreaming_enabled: false,
  space_members: [{ count: 1 }],
  documents: [{ count: 12 }],
  ...overrides,
});

describe('the spaces a reader can see', () => {
  it('reports how many people and documents are in each one', async () => {
    const { supabase } = spacesTable({
      data: [spaceRow({ name: 'Growth', kind: 'team', dreaming_enabled: true })],
      error: null,
    });

    expect(await listVisibleSpaces(supabase)).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Growth',
        kind: 'team',
        dreamingEnabled: true,
        memberCount: 1,
        documentCount: 12,
      },
    ]);
  });

  it('reads a brand new space as empty rather than as missing numbers', async () => {
    const { supabase } = spacesTable({
      data: [spaceRow({ space_members: [], documents: null })],
      error: null,
    });

    const [space] = await listVisibleSpaces(supabase);
    expect(space.memberCount).toBe(0);
    expect(space.documentCount).toBe(0);
  });

  it('hands back personal first, then the org space, then teams alphabetically', async () => {
    const { supabase } = spacesTable({
      data: [
        spaceRow({ id: 'zebra', name: 'Zebra', kind: 'team' }),
        spaceRow({ id: 'everyone', name: 'Everyone', kind: 'org' }),
        spaceRow({ id: 'apples', name: 'Apples', kind: 'team' }),
        spaceRow({ id: 'mine', name: 'Personal', kind: 'personal' }),
      ],
      error: null,
    });

    const spaces = await listVisibleSpaces(supabase);
    expect(spaces.map((space) => space.id)).toEqual(['mine', 'everyone', 'apples', 'zebra']);
  });

  it('shows nothing to a reader who is in no space at all', async () => {
    const { supabase } = spacesTable({ data: null, error: null });

    expect(await listVisibleSpaces(supabase)).toEqual([]);
  });

  it('raises a failed read rather than passing it off as an empty account', async () => {
    const { supabase } = spacesTable({ data: null, error: { message: 'permission denied' } });

    await expect(listVisibleSpaces(supabase)).rejects.toThrow('permission denied');
  });

  it('lets row level security pick the rows, filtering on nothing itself', async () => {
    const { supabase, asked } = spacesTable({ data: [], error: null });
    await listVisibleSpaces(supabase);

    expect(asked).toEqual([
      'id, name, kind, dreaming_enabled, space_members(count), documents(count)',
    ]);
  });
});

describe('the spaces a selector offers', () => {
  it('asks for only the three facts a selector shows', async () => {
    const { supabase, asked } = spacesTable({ data: [], error: null });
    await listSpaceOptions(supabase);

    expect(asked).toEqual(['id, name, kind']);
  });

  it('offers them in the same fixed order the list uses', async () => {
    const { supabase } = spacesTable({
      data: [
        { id: 'zebra', name: 'Zebra', kind: 'team' },
        { id: 'mine', name: 'Personal', kind: 'personal' },
        { id: 'everyone', name: 'Everyone', kind: 'org' },
      ],
      error: null,
    });

    const options = await listSpaceOptions(supabase);
    expect(options.map((option) => option.id)).toEqual(['mine', 'everyone', 'zebra']);
  });

  it('offers nothing when the reader is in no space', async () => {
    const { supabase } = spacesTable({ data: null, error: null });

    expect(await listSpaceOptions(supabase)).toEqual([]);
  });

  it('raises a failed read rather than emptying the selector in silence', async () => {
    const { supabase } = spacesTable({ data: null, error: { message: 'permission denied' } });

    await expect(listSpaceOptions(supabase)).rejects.toThrow('permission denied');
  });
});
