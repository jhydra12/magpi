import type { ForceGraphMethods } from 'react-force-graph-3d';
import { AmbientLight, type PerspectiveCamera } from 'three';

import type { GraphLink, GraphNode } from './graph-data';

/**
 * Color stays on the entities. Links are neutral, files stay hidden until a
 * neighborhood is in focus, the way a graph view stays readable.
 */
export const GRAPH_SCENE = {
  nodeRelSize: 3.4,
  entityVal: 2.2,
  fileVal: 0.22,
  warmupTicks: 220,
  nodeResolution: 20,
  linkOpacity: 1,
  dimFade: 0.55,
} as const;

/** Pull each kind into its own part of the map so the colors can be told apart. */
const KIND_ANCHOR: Record<string, { x: number; y: number }> = {
  person: { x: -78, y: -46 },
  project: { x: 78, y: -46 },
  customer: { x: -78, y: 52 },
  decision: { x: 78, y: 52 },
};

export type GraphPalette = {
  background: string;
  document: string;
  person: string;
  project: string;
  customer: string;
  decision: string;
};

type ChargeForce = {
  strength?: (value: (node: GraphNode) => number) => unknown;
};

type LinkForce = {
  strength?: (value: (link: GraphLink) => number) => unknown;
  distance?: (value: (link: GraphLink) => number) => unknown;
};

function endId(end: string | { id?: string }): string {
  return typeof end === 'string' ? end : (end.id ?? '');
}

function visualRadius(node: GraphNode): number {
  const value = node.kind === 'entity' ? GRAPH_SCENE.entityVal : GRAPH_SCENE.fileVal;
  return Math.cbrt(value) * GRAPH_SCENE.nodeRelSize;
}

/** Entities the focus touches, plus the focus itself. Null means the whole map. */
export function neighborhood(
  links: readonly GraphLink[],
  focusId: string | null,
): ReadonlySet<string> | null {
  if (!focusId) return null;
  const ids = new Set<string>([focusId]);
  for (const link of links) {
    const source = endId(link.source);
    const target = endId(link.target);
    if (source === focusId) ids.add(target);
    else if (target === focusId) ids.add(source);
  }
  return ids;
}

export function mixHex(color: string, toward: string, amount: number): string {
  const from = Number.parseInt(color.slice(1), 16);
  const to = Number.parseInt(toward.slice(1), 16);
  const channel = (shift: number) => {
    const start = (from >> shift) & 255;
    const end = (to >> shift) & 255;
    return Math.round(start + (end - start) * amount);
  };
  const mixed = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  return `#${mixed.toString(16).padStart(6, '0')}`;
}

function entityHex(kind: string | undefined, colors: GraphPalette): string {
  if (kind === 'project') return colors.project;
  if (kind === 'customer') return colors.customer;
  if (kind === 'decision') return colors.decision;
  return colors.person;
}

export function paintNode(
  node: GraphNode,
  colors: GraphPalette,
  focus: ReadonlySet<string> | null,
): string {
  const base = node.kind === 'document' ? colors.document : entityHex(node.entityKind, colors);
  if (!focus || focus.has(node.id)) return base;
  return mixHex(base, colors.background, GRAPH_SCENE.dimFade);
}

export function paintLink(
  link: GraphLink,
  colors: GraphPalette,
  focus: ReadonlySet<string> | null,
): string {
  const touched = focus !== null && focus.has(endId(link.source)) && focus.has(endId(link.target));
  if (touched) return colors.document;
  return mixHex(colors.document, colors.background, 0.94);
}

export function showNode(node: GraphNode): boolean {
  return node.kind === 'entity';
}

/** Spokes from the focused entity only. The files themselves stay in the detail. */
export function showLink(link: GraphLink, focusId: string | null): boolean {
  if (!focusId || link.kind !== 'shared') return false;
  return endId(link.source) === focusId || endId(link.target) === focusId;
}

/** Keep entities from stacking. Files are allowed to sit on their entity. */
function separateNodes() {
  let nodes: GraphNode[] = [];
  const force = () => {
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left];
        const b = nodes[right];
        if (a.kind === 'document' || b.kind === 'document') continue;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = visualRadius(a) + visualRadius(b) + 14;
        if (dist >= min) continue;
        const push = ((min - dist) / dist) * 0.5;
        a.x = (a.x ?? 0) - dx * push;
        a.y = (a.y ?? 0) - dy * push;
        b.x = (b.x ?? 0) + dx * push;
        b.y = (b.y ?? 0) + dy * push;
      }
    }
  };
  force.initialize = (next: GraphNode[]) => {
    nodes = next;
  };
  return force;
}

function anchorKinds() {
  let nodes: GraphNode[] = [];
  const force = () => {
    for (const node of nodes) {
      if (node.kind !== 'entity' || !node.entityKind) continue;
      const anchor = KIND_ANCHOR[node.entityKind];
      if (!anchor) continue;
      node.x = (node.x ?? 0) + (anchor.x - (node.x ?? 0)) * 0.18;
      node.y = (node.y ?? 0) + (anchor.y - (node.y ?? 0)) * 0.18;
    }
  };
  force.initialize = (next: GraphNode[]) => {
    nodes = next;
  };
  return force;
}

/** Flat light, so a teal node stays teal instead of picking up a highlight. */
export function tuneGraph(graph: ForceGraphMethods<GraphNode, GraphLink>) {
  const charge = graph.d3Force('charge') as ChargeForce | undefined;
  charge?.strength?.((node) => (node.kind === 'document' ? 0 : -8));
  const link = graph.d3Force('link') as LinkForce | undefined;
  link?.distance?.((item) => (item.kind === 'shared' ? 28 : 4));
  link?.strength?.((item) => (item.kind === 'shared' ? 0.02 : 0.9));
  graph.d3Force('anchor', anchorKinds());
  graph.d3Force('separate', separateNodes());
  graph.lights([new AmbientLight('white', 1.15)]);
}

/** Frame the entities. File nodes sit on them and would only shrink the picture. */
export function frameGraph(graph: ForceGraphMethods<GraphNode, GraphLink>) {
  graph.zoomToFit(0, 36, (node) => (node as GraphNode).kind === 'entity');
  const camera = graph.camera() as PerspectiveCamera;
  const distance = camera.position.length();
  if (!Number.isFinite(distance) || distance === 0) return;
  graph.cameraPosition(
    { x: distance * 0.02, y: distance * 0.04, z: distance },
    { x: 0, y: 0, z: 0 },
    0,
  );
}
