'use client';

import dynamic from 'next/dynamic';

import type { EntityGroup } from '@/lib/dreams/entities';

const EntityGraphCanvas = dynamic(() => import('./entity-graph-canvas'), { ssr: false });

export function EntityGraph({
  groups,
  active,
}: {
  groups: readonly EntityGroup[];
  active: boolean;
}) {
  return <EntityGraphCanvas groups={groups} active={active} />;
}
