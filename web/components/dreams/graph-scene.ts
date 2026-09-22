import type { ForceGraphMethods } from 'react-force-graph-3d';
import { AmbientLight, type PerspectiveCamera } from 'three';

import type { GraphLink, GraphNode } from './graph-data';

/**
 * Color stays on the entities. Links are neutral, files stay hidden until a
 * neighborhood is in focus, the way a graph view stays readable.
 */
export const GRAPH_SCENE = {
  nodeRelSize: 3.2,
  entityVal: 2.2,
  fileVal: 0.22,
  warmupTicks: 280,
  nodeResolution: 16,
  linkOpacity: 0.9,
  // A heavier mix toward white turns teal and gold into gray.
  dimFade: 0.4,
  maxKindLinks: 8,
  maxBackboneDegree: 1,
  maxBridgeLinks: 5,
  restLinkWidth: 0.16,
  restLinkFade: 0.62,
  focusLinkWidth: 0.62,
  anchorPull: 0.11,
  zoomIn: 0.72,
  zoomOut: 1.4,
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

/** Larger entities are the ones mentioned in more files. */
export function nodeMagnitude(node: GraphNode): number {
  if (node.kind !== 'entity') return GRAPH_SCENE.fileVal;
  const files = node.documents?.length ?? 1;
  return Math.min(5.5, 1.1 + Math.log2(files + 1) * 0.9);
}

function visualRadius(node: GraphNode): number {
  return Math.cbrt(nodeMagnitude(node)) * GRAPH_SCENE.nodeRelSize;
}

export function linkKey(source: string, target: string): string {
  return source < target ? `${source}\0${target}` : `${target}\0${source}`;
}

export function connectedEntities(
  nodeId: string,
  links: readonly GraphLink[],
  nodes: readonly GraphNode[],
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const shared = new Map<string, number>();
  for (const link of links) {
    if (link.kind !== 'shared') continue;
    const source = endId(link.source);
    const target = endId(link.target);
    const other = source === nodeId ? target : target === nodeId ? source : null;
    if (!other) continue;
    shared.set(other, link.sharedFiles.length);
  }
  return [...shared.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .flatMap(([id, count]) => {
      const node = byId.get(id);
      return node
        ? [{ id, label: node.label, entityKind: node.entityKind ?? '', sharedFiles: count }]
        : [];
    });
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
  kindFilter?: string | null,
): string {
  const base = node.kind === 'document' ? colors.document : entityHex(node.entityKind, colors);
  const outsideFocus = focus !== null && !focus.has(node.id);
  const outsideKind =
    Boolean(kindFilter) && node.kind === 'entity' && node.entityKind !== kindFilter;
  if (!outsideFocus && !outsideKind) return base;
  return mixHex(base, colors.background, GRAPH_SCENE.dimFade);
}

export function paintLink(
  link: GraphLink,
  colors: GraphPalette,
  focus: ReadonlySet<string> | null,
): string {
  const touched = focus !== null && focus.has(endId(link.source)) && focus.has(endId(link.target));
  if (touched) return colors.document;
  if (focus) return mixHex(colors.document, colors.background, 0.84);
  return mixHex(colors.document, colors.background, GRAPH_SCENE.restLinkFade);
}

export function showNode(node: GraphNode): boolean {
  return node.kind === 'entity';
}

/** Focus draws that entity's ties. At rest, only the backbone is drawn. */
export function showLink(
  link: GraphLink,
  focusId: string | null,
  backbone: ReadonlySet<string>,
): boolean {
  if (link.kind !== 'shared') return false;
  const source = endId(link.source);
  const target = endId(link.target);
  if (focusId) return source === focusId || target === focusId;
  return backbone.has(linkKey(source, target));
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
      const pull = GRAPH_SCENE.anchorPull;
      node.x = (node.x ?? 0) + (anchor.x - (node.x ?? 0)) * pull;
      node.y = (node.y ?? 0) + (anchor.y - (node.y ?? 0)) * pull;
    }
  };
  force.initialize = (next: GraphNode[]) => {
    nodes = next;
  };
  return force;
}

/** Flat light, so a teal node stays teal instead of picking up a highlight. */
export function tuneGraph(
  graph: ForceGraphMethods<GraphNode, GraphLink>,
  backbone: () => ReadonlySet<string>,
) {
  const charge = graph.d3Force('charge') as ChargeForce | undefined;
  charge?.strength?.((node) => (node.kind === 'document' ? 0 : -34));
  const link = graph.d3Force('link') as LinkForce | undefined;
  link?.distance?.((item) => (item.kind === 'shared' ? 68 : 4));
  link?.strength?.((item) => {
    if (item.kind !== 'shared') return 0.9;
    const key = linkKey(endId(item.source), endId(item.target));
    return backbone().has(key) ? 0.16 : 0;
  });
  graph.d3Force('anchor', anchorKinds());
  graph.d3Force('separate', separateNodes());
  graph.lights([new AmbientLight('white', 1.15)]);
  const renderer = graph.renderer();
  renderer.setClearColor(0x000000, 0);
  graph.scene().background = null;
  renderer.domElement.style.background = 'transparent';
}

/** Frame the entities. File nodes sit on them and would only shrink the picture. */
export function frameGraph(graph: ForceGraphMethods<GraphNode, GraphLink>) {
  graph.zoomToFit(0, 36, (node) => (node as GraphNode).kind === 'entity');
  const camera = graph.camera() as PerspectiveCamera;
  const distance = camera.position.length();
  if (!Number.isFinite(distance) || distance === 0) return;
  // The renderer's own far plane is 2000. A few hundred names are framed from further
  // out than that, which draws a black canvas.
  if (camera.far < distance * 2) {
    camera.far = distance * 2;
    camera.updateProjectionMatrix();
  }
  graph.cameraPosition(
    { x: distance * 0.02, y: distance * 0.04, z: distance },
    { x: 0, y: 0, z: 0 },
    0,
  );
}

export function zoomGraph(
  graph: ForceGraphMethods<GraphNode, GraphLink>,
  factor: number,
  duration: number,
) {
  const camera = graph.camera() as PerspectiveCamera;
  const { x, y, z } = camera.position;
  const distance = Math.hypot(x, y, z);
  if (!Number.isFinite(distance) || distance === 0) return;
  graph.cameraPosition(
    { x: x * factor, y: y * factor, z: z * factor },
    { x: 0, y: 0, z: 0 },
    duration,
  );
}
