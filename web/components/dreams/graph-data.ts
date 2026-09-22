import type { EntityGroup } from '@/lib/dreams/entities';

export type GraphDocument = {
  id: string;
  title: string;
};

export type GraphNode = {
  id: string;
  label: string;
  kind: 'entity' | 'document';
  entityKind?: string;
  summary?: string | null;
  documents?: GraphDocument[];
  title?: string;
  /** How many links this node ended up with, so the busiest names draw largest. */
  degree?: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
};

export type GraphLink = {
  source: string;
  target: string;
  kind: 'mention' | 'shared';
  sharedFiles: string[];
  /** Files the two ends have in common. Drawn as width, so a real tie reads as one. */
  weight?: number;
};

/**
 * Above this many entities, a file says nothing about any particular pair in it: a release note
 * naming thirty things would otherwise contribute 435 links on its own, which is what turns the
 * graph into one ball. A pair from a crowded file is kept only when another file repeats it.
 */
const CROWDED_FILE = 6;

/**
 * Ties kept per entity. Filtering crowded files alone still leaves a mesh, because this corpus is
 * mostly short files that name several things each. Keeping each entity's strongest few ties caps
 * the drawing at a few links per node, which is what lets clusters separate instead of packing
 * into one ball. A link survives when either end counts it among its best, so nothing is orphaned.
 */
const TIES_PER_ENTITY = 3;

/** The strongest ties of each end, unioned. Ordered by weight, then by id so it never flickers. */
function strongestTies(links: readonly GraphLink[]): GraphLink[] {
  const byEntity = new Map<string, GraphLink[]>();
  for (const link of links) {
    for (const end of [link.source, link.target]) {
      byEntity.set(end, [...(byEntity.get(end) ?? []), link]);
    }
  }
  const kept = new Set<GraphLink>();
  for (const [, theirs] of byEntity) {
    const ranked = [...theirs].sort(
      (a, b) =>
        (b.weight ?? 1) - (a.weight ?? 1) ||
        `${a.source}${a.target}`.localeCompare(`${b.source}${b.target}`),
    );
    for (const link of ranked.slice(0, TIES_PER_ENTITY)) kept.add(link);
  }
  return links.filter((link) => kept.has(link));
}

export type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

function entityKey(kind: string, name: string): string {
  return `${kind}:${name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}`;
}

/** Build connections from shared document IDs, independent of duplicate titles. */
export function buildGraph(groups: readonly EntityGroup[]): GraphData {
  const entities = new Map<string, GraphNode>();
  const documents = new Map<string, { title: string; entities: Set<string> }>();
  const filesByEntity = new Map<string, Map<string, GraphDocument>>();
  for (const group of groups) {
    for (const entity of group.entities) {
      const id = `entity:${entityKey(group.kind, entity.name)}`;
      const existing = entities.get(id);
      if (!existing) {
        entities.set(id, {
          id,
          label: entity.name,
          kind: 'entity',
          entityKind: group.kind,
          summary: entity.summary,
        });
      } else if (!existing.summary && entity.summary) {
        existing.summary = entity.summary;
      }
      const files = filesByEntity.get(id) ?? new Map<string, GraphDocument>();
      for (const document of entity.documents) {
        files.set(document.id, { id: document.id, title: document.title });
        const entry = documents.get(document.id) ?? {
          title: document.title,
          entities: new Set<string>(),
        };
        entry.entities.add(id);
        documents.set(document.id, entry);
      }
      filesByEntity.set(id, files);
    }
  }
  const nodes = [...entities.values()].map((node) => ({
    ...node,
    documents: [...(filesByEntity.get(node.id)?.values() ?? [])],
  }));
  const links: GraphLink[] = [];
  const shared = new Map<string, GraphLink & { smallestFile: number }>();
  const documentNodes: GraphNode[] = [];
  for (const [documentId, document] of documents) {
    const id = `document:${documentId}`;
    documentNodes.push({ id, label: document.title, title: document.title, kind: 'document' });
    const members = [...document.entities].sort();
    for (const source of members)
      links.push({ source, target: id, kind: 'mention', sharedFiles: [document.title] });
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        const source = members[left];
        const target = members[right];
        const key = JSON.stringify([source, target]);
        const link = shared.get(key) ?? {
          source,
          target,
          kind: 'shared' as const,
          sharedFiles: [],
          smallestFile: Infinity,
        };
        link.sharedFiles.push(document.title);
        link.smallestFile = Math.min(link.smallestFile, members.length);
        shared.set(key, link);
      }
    }
  }

  // A pair is drawn when it repeats, or when the one file that names both is a short one.
  const candidates = [...shared.values()]
    .filter((link) => link.sharedFiles.length > 1 || link.smallestFile <= CROWDED_FILE)
    .map(({ source, target, kind, sharedFiles }) => ({
      source,
      target,
      kind,
      sharedFiles,
      weight: sharedFiles.length,
    }));
  const sharedLinks = strongestTies(candidates);

  const allLinks = [...links, ...sharedLinks];
  const degrees = new Map<string, number>();
  for (const link of allLinks) {
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
  }
  const withDegree = (node: GraphNode): GraphNode => ({
    ...node,
    degree: degrees.get(node.id) ?? 0,
  });
  return {
    nodes: [...nodes.map(withDegree), ...documentNodes.map(withDegree)],
    links: allLinks,
  };
}

/** Keep simulation coordinates when fresh query results add entities. */
export function retainGraphPositions(next: GraphData, previous?: GraphData): GraphData {
  const byId = new Map(previous?.nodes.map((node) => [node.id, node]));
  return {
    ...next,
    nodes: next.nodes.map((node) => {
      const old = byId.get(node.id);
      return old
        ? { ...node, x: old.x, y: old.y, z: old.z, vx: old.vx, vy: old.vy, vz: old.vz }
        : node;
    }),
  };
}
