'use client';

import dynamic from 'next/dynamic';

import type { EntityGroup } from '@/lib/dreams/entities';

const EntityGraphCanvas = dynamic(() => import('./entity-graph-canvas'), { ssr: false });

export function EntityGraph({ groups }: { groups: readonly EntityGroup[] }) {
  return <EntityGraphCanvas groups={groups} />;
}
