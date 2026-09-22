import { describe, expect, it } from 'vitest';

import type { GraphLink, GraphNode } from './graph-data';
import { neighborhood, paintNode, showLink, showNode, type GraphPalette } from './graph-scene';

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
  it('keeps files and lines off the map until something is in focus', () => {
    expect(showNode(file)).toBe(false);
    expect(showNode(person)).toBe(true);
    expect(showLink(mention, null)).toBe(false);
    expect(showLink(shared, null)).toBe(false);
  });

  it('draws only the shared-file spokes from the focused entity', () => {
    const focus = neighborhood([shared, mention], person.id);
    expect(showNode(file)).toBe(false);
    expect(showNode(project)).toBe(true);
    expect(showLink(mention, person.id)).toBe(false);
    expect(showLink(shared, person.id)).toBe(true);
    expect(paintNode(person, colors, focus)).toBe(colors.person);
  });

  it('washes entities outside the neighborhood toward the background', () => {
    const focus = neighborhood([mention], person.id);
    expect(paintNode(project, colors, focus)).not.toBe(colors.project);
  });
});
