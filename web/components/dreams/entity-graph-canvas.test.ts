import { describe, expect, it } from 'vitest';

import { buildGraph } from './entity-graph-canvas';

describe('entity graph data', () => {
  it('uses node IDs for shared entity links', () => {
    const graph = buildGraph([
      {
        kind: 'person',
        label: 'People',
        entities: [
          {
            id: 'person-1',
            name: 'Ada Lovelace',
            summary: null,
            documents: [{ id: 'doc-1', title: 'Launch plan', url: null }],
          },
        ],
      },
      {
        kind: 'project',
        label: 'Projects',
        entities: [
          {
            id: 'project-1',
            name: 'Launch plan',
            summary: null,
            documents: [{ id: 'doc-1', title: 'Launch plan', url: null }],
          },
        ],
      },
    ]);

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    expect(graph.links).toContainEqual(
      expect.objectContaining({ source: 'entity:person:ada lovelace', target: 'entity:project:launch plan' }),
    );
    expect(graph.links.every((link) => nodeIds.has(link.source) && nodeIds.has(link.target))).toBe(true);
  });
});
