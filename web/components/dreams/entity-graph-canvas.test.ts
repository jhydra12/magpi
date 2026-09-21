import { describe, expect, it } from 'vitest';

import { buildGraph, retainGraphPositions } from './graph-data';

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
      expect.objectContaining({
        source: 'entity:person:ada lovelace',
        target: 'entity:project:launch plan',
      }),
    );
    expect(graph.links.every((link) => nodeIds.has(link.source) && nodeIds.has(link.target))).toBe(
      true,
    );
  });
});

it('does not connect different documents with identical titles', () => {
  const graph = buildGraph([
    {
      kind: 'person',
      label: 'People',
      entities: ['Ada', 'Ben'].map((name, i) => ({
        id: String(i),
        name,
        summary: null,
        documents: [{ id: `doc-${i}`, title: 'Weekly update', url: null }],
      })),
    },
  ]);
  expect(graph.links.filter((link) => link.kind === 'shared')).toEqual([]);
});

it('merges a person across spaces using shared document IDs without duplicate mentions', () => {
  const graph = buildGraph([
    {
      kind: 'person',
      label: 'People',
      entities: [1, 2].map((id) => ({
        id: String(id),
        name: 'Ada',
        summary: null,
        documents: [{ id: 'doc', title: 'Plan', url: null }],
      })),
    },
  ]);
  expect(graph.nodes).toHaveLength(2);
  expect(graph.links).toHaveLength(1);
});

it('builds a large sparse graph without scanning every entity pair against every document', () => {
  const groups = [
    {
      kind: 'person' as const,
      label: 'People',
      entities: Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        summary: null,
        documents: [0, 1, 2].map((offset) => ({
          id: `doc-${(i + offset) % 1000}`,
          title: `File ${(i + offset) % 1000}`,
          url: null,
        })),
      })),
    },
  ];
  const start = performance.now();
  const graph = buildGraph(groups);
  expect(graph.nodes).toHaveLength(2000);
  // 3000 mentions, and a pair link for each of the 2000 co-occurrences that survives pruning.
  const mentions = graph.links.filter((link) => link.kind === 'mention');
  expect(mentions).toHaveLength(3000);
  expect(graph.links.length).toBeLessThanOrEqual(5000);
  expect(performance.now() - start).toBeLessThan(1000);
});

it('draws no pair links for a file crowded with names, since it says nothing about any pair', () => {
  // Twelve names in one file would be 66 pairs unpruned; a file that crowded contributes none
  // unless another file repeats the pair.
  const crowded = [
    {
      kind: 'person' as const,
      label: 'People',
      entities: Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        summary: null,
        documents: [{ id: 'doc-0', title: 'Release notes', url: null }],
      })),
    },
  ];
  const graph = buildGraph(crowded);
  expect(graph.links.filter((link) => link.kind === 'shared')).toHaveLength(0);
  expect(graph.links.filter((link) => link.kind === 'mention')).toHaveLength(12);
});

it('preserves existing simulation coordinates when new nodes arrive', () => {
  const old = {
    nodes: [{ id: 'person', label: 'Ada', kind: 'entity' as const, x: 10, y: 20, z: 30 }],
    links: [],
  };
  const next = retainGraphPositions(
    {
      nodes: [
        { id: 'person', label: 'Ada', kind: 'entity' },
        { id: 'new', label: 'Ben', kind: 'entity' },
      ],
      links: [],
    },
    old,
  );
  expect(next.nodes[0]).toMatchObject({ x: 10, y: 20, z: 30 });
  expect(next.nodes[1].x).toBeUndefined();
});
