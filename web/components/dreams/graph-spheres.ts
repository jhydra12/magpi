'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Mesh, MeshBasicMaterial, SphereGeometry } from 'three';

import type { GraphNode } from './graph-data';
import { readGraphColors } from './graph-colors';
import { GRAPH_SCENE, nodeMagnitude, paintNode, type GraphPalette } from './graph-scene';

const SPHERE = new SphereGeometry(1, 32, 24);

type Paint = {
  colors: GraphPalette | null;
  focus: ReadonlySet<string> | null;
  kindFilter: string | null;
  focusId: string | null;
};

/** Flat spheres. Lambert shading on a transparent canvas turns these colors gray. */
function entitySphere(
  node: GraphNode,
  color: string,
  magnitude: number,
  cache: Map<string, Mesh>,
): Mesh {
  let mesh = cache.get(node.id);
  if (!mesh) {
    mesh = new Mesh(SPHERE, new MeshBasicMaterial({ toneMapped: false }));
    cache.set(node.id, mesh);
  }
  (mesh.material as MeshBasicMaterial).color.set(color);
  mesh.scale.setScalar(Math.cbrt(magnitude) * GRAPH_SCENE.nodeRelSize);
  return mesh;
}

function magnitudeFor(node: GraphNode, focusId: string | null): number {
  return nodeMagnitude(node) * (node.id === focusId ? 1.28 : 1);
}

export function useEntitySpheres(
  nodes: readonly GraphNode[],
  colors: GraphPalette | null,
  focus: ReadonlySet<string> | null,
  kindFilter: string | null,
  focusId: string | null,
) {
  const spheres = useRef(new Map<string, Mesh>());
  const paintRef = useRef<Paint>({ colors, focus, kindFilter, focusId });

  useLayoutEffect(() => {
    paintRef.current = { colors, focus, kindFilter, focusId };
  });

  const nodeObject = useCallback((node: GraphNode) => {
    const paint = paintRef.current;
    const colors = paint.colors ?? readGraphColors();
    return entitySphere(
      node,
      paintNode(node, colors, paint.focus, paint.kindFilter),
      magnitudeFor(node, paint.focusId),
      spheres.current,
    );
  }, []);

  useEffect(() => {
    if (!colors) return;
    for (const node of nodes) {
      if (!spheres.current.has(node.id)) continue;
      entitySphere(
        node,
        paintNode(node, colors, focus, kindFilter),
        magnitudeFor(node, focusId),
        spheres.current,
      );
    }
  }, [colors, focus, focusId, kindFilter, nodes]);

  return nodeObject;
}
