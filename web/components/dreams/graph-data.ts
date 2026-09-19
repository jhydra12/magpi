import type { EntityGroup } from '@/lib/dreams/entities';

export type GraphNode = {
  id: string;
  label: string;
  kind: 'entity' | 'document';
  entityKind?: string;
  documents?: string[];
  title?: string;
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
};

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
  const filesByEntity = new Map<string, Map<string, string>>();
  for (const group of groups) {
    for (const entity of group.entities) {
      const id = `entity:${entityKey(group.kind, entity.name)}`;
      if (!entities.has(id))
        entities.set(id, {
          id,
          label: entity.name,
          kind: 'entity',
          entityKind: group.kind,
        });
      const files = filesByEntity.get(id) ?? new Map<string, string>();
      for (const document of entity.documents) {
        files.set(document.id, document.title);
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
  const shared = new Map<string, GraphLink>();
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
        const link = shared.get(key) ?? { source, target, kind: 'shared', sharedFiles: [] };
        link.sharedFiles.push(document.title);
        shared.set(key, link);
      }
    }
  }
  return { nodes: [...nodes, ...documentNodes], links: [...links, ...shared.values()] };
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
