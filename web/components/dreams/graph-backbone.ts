import type { GraphLink } from './graph-data';
import { GRAPH_SCENE, linkKey } from './graph-scene';

function endId(end: string | { id?: string }): string {
  return typeof end === 'string' ? end : (end.id ?? '');
}

function rankedShared(links: readonly GraphLink[]): GraphLink[] {
  return links
    .filter((link) => link.kind === 'shared')
    .slice()
    .sort((left, right) => {
      const weight = right.sharedFiles.length - left.sharedFiles.length;
      if (weight !== 0) return weight;
      return linkKey(endId(left.source), endId(left.target)).localeCompare(
        linkKey(endId(right.source), endId(right.target)),
      );
    });
}

function takeTies(
  links: readonly GraphLink[],
  keys: Set<string>,
  degreeCap: number,
  limit: number,
) {
  const degree = new Map<string, number>();
  for (const link of links) {
    if (keys.size >= limit) return;
    const source = endId(link.source);
    const target = endId(link.target);
    if ((degree.get(source) ?? 0) >= degreeCap) continue;
    if ((degree.get(target) ?? 0) >= degreeCap) continue;
    const key = linkKey(source, target);
    if (keys.has(key)) continue;
    keys.add(key);
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  }
}

/**
 * A few ties inside each color, then a handful of bridges.
 * The strongest ties overall run between hubs and turn the resting map into a knot.
 */
export function backboneKeys(
  links: readonly GraphLink[],
  kinds: ReadonlyMap<string, string> = new Map(),
): ReadonlySet<string> {
  const buckets = new Map<string, GraphLink[]>();
  const cross: GraphLink[] = [];
  for (const link of rankedShared(links)) {
    const sourceKind = kinds.get(endId(link.source));
    const targetKind = kinds.get(endId(link.target));
    if (sourceKind && targetKind && sourceKind !== targetKind) {
      cross.push(link);
      continue;
    }
    const bucket = sourceKind ?? '';
    const list = buckets.get(bucket) ?? [];
    list.push(link);
    buckets.set(bucket, list);
  }
  const keys = new Set<string>();
  for (const list of buckets.values()) {
    takeTies(list, keys, GRAPH_SCENE.maxBackboneDegree, keys.size + GRAPH_SCENE.maxKindLinks);
  }
  takeTies(cross, keys, 1, keys.size + GRAPH_SCENE.maxBridgeLinks);
  return keys;
}
