import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

export type SpaceKind = Database['public']['Enums']['space_kind'];

export type Space = {
  readonly id: string;
  readonly name: string;
  readonly kind: SpaceKind;
  readonly dreamingEnabled: boolean;
  readonly memberCount: number;
  readonly documentCount: number;
};

/** What the space selector needs, and nothing more. */
export type SpaceOption = Pick<Space, 'id' | 'name' | 'kind'>;

export function describeKind(kind: SpaceKind): string {
  switch (kind) {
    case 'personal':
      return 'Only you';
    case 'team':
      return 'The people you add';
    case 'org':
      return 'Organization space';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** Personal first, then the org space, then teams alphabetically. */
const KIND_ORDER: Record<SpaceKind, number> = { personal: 0, org: 1, team: 2 };

export function sortSpaces<T extends { kind: SpaceKind; name: string }>(spaces: readonly T[]): T[] {
  return [...spaces].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
  );
}

function countOf(rows: { count: number }[] | null | undefined): number {
  return rows?.[0]?.count ?? 0;
}

/** Every space the caller can see. RLS decides which, not this query. */
export async function listVisibleSpaces(
  supabase: SupabaseClient<Database>,
): Promise<readonly Space[]> {
  const { data, error } = await supabase
    .from('spaces')
    .select('id, name, kind, dreaming_enabled, space_members(count), documents(count)');

  if (error) throw new Error(error.message);

  return sortSpaces(
    (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      dreamingEnabled: row.dreaming_enabled,
      memberCount: countOf(row.space_members),
      documentCount: countOf(row.documents),
    })),
  );
}

export async function listSpaceOptions(
  supabase: SupabaseClient<Database>,
): Promise<readonly SpaceOption[]> {
  const { data, error } = await supabase.from('spaces').select('id, name, kind');
  if (error) throw new Error(error.message);
  return sortSpaces(data ?? []);
}
