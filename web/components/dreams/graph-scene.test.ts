import { describe, expect, it } from 'vitest';

import type { GraphLink, GraphNode } from './graph-data';
import { backboneKeys } from './graph-backbone';
import {
  GRAPH_SCENE,
  linkKey,
  neighborhood,
  nodeMagnitude,
  paintNode,
  showLink,
  showNode,
  type GraphPalette,
} from './graph-scene';

const color = (digits: string) => `#${digits}`;

const colors: GraphPalette = {
  background: color('ffffff'),
  document: color('64748b'),
  person: color('0f766e'),
  project: color('6d28d9'),
  customer: color('a16207'),
  decision: color('c2410c'),
};

const person: GraphNode = {
  id: 'entity:person:ada',
  label: 'Ada',
  kind: 'entity',
  entityKind: 'person',
};
const project: GraphNode = {
  id: 'entity:project:launch',
  label: 'Launch',
  kind: 'entity',
  entityKind: 'project',
};
const file: GraphNode = { id: 'document:doc-1', label: 'Plan', kind: 'document' };

const shared: GraphLink = {
  source: person.id,
  target: project.id,
  kind: 'shared',
  sharedFiles: ['Plan'],
};
const mention: GraphLink = {
  source: person.id,
  target: file.id,
  kind: 'mention',
  sharedFiles: ['Plan'],
};

describe('graph focus', () => {
  it('keeps files off the map and hides links that are not in the backbone', () => {
    expect(showNode(file)).toBe(false);
    expect(showNode(person)).toBe(true);
    expect(showLink(mention, null, new Set())).toBe(false);
    expect(showLink(shared, null, new Set())).toBe(false);
    expect(showLink(shared, null, new Set([linkKey(person.id, project.id)]))).toBe(true);
  });

  it('draws only the shared-file spokes from the focused entity', () => {
    const focus = neighborhood([shared, mention], person.id);
    expect(showNode(file)).toBe(false);
    expect(showNode(project)).toBe(true);
    expect(showLink(mention, person.id, new Set())).toBe(false);
    expect(showLink(shared, person.id, new Set())).toBe(true);
    expect(paintNode(person, colors, focus)).toBe(colors.person);
  });

  it('washes entities outside the neighborhood toward the background', () => {
    const focus = neighborhood([mention], person.id);
    expect(paintNode(project, colors, focus)).not.toBe(colors.project);
  });

  it('washes entities outside the selected kind', () => {
    expect(paintNode(project, colors, null, 'person')).not.toBe(colors.project);
    expect(paintNode(person, colors, null, 'person')).toBe(colors.person);
  });

  it('keeps the heaviest ties and caps how many leave one entity', () => {
    const links = [1, 2, 3, 4].map((index) => ({
      source: 'hub',
      target: `other-${index}`,
      kind: 'shared' as const,
      sharedFiles: Array.from({ length: 5 - index }, () => `file-${index}`),
    }));
    const keys = backboneKeys(links);
    expect(keys.has(linkKey('hub', 'other-1'))).toBe(true);
    expect(keys.size).toBe(GRAPH_SCENE.maxBackboneDegree);
  });

  it('keeps a tie inside each color and only a few bridges', () => {
    const kinds = new Map<string, string>([
      ['p0', 'person'],
      ['p1', 'person'],
    ]);
    const links: GraphLink[] = [
      { source: 'p0', target: 'p1', kind: 'shared', sharedFiles: ['once'] },
    ];
    for (let index = 0; index < 10; index += 1) {
      kinds.set(`a${index}`, 'customer');
      kinds.set(`b${index}`, 'decision');
      links.push({
        source: `a${index}`,
        target: `b${index}`,
        kind: 'shared',
        sharedFiles: ['x', 'y', 'z'],
      });
    }
    const keys = backboneKeys(links, kinds);
    expect(keys.has(linkKey('p0', 'p1'))).toBe(true);
    const bridges = Array.from({ length: 10 }, (_, index) =>
      keys.has(linkKey(`a${index}`, `b${index}`)),
    ).filter(Boolean);
    expect(bridges).toHaveLength(GRAPH_SCENE.maxBridgeLinks);
  });

  it('draws larger nodes for entities that show up in more files', () => {
    expect(nodeMagnitude({ ...person, documents: [{ id: 'a', title: 'A' }] })).toBeLessThan(
      nodeMagnitude({
        ...person,
        documents: ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id })),
      }),
    );
  });
});
