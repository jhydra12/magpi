'use client';

/* ENTITY GRAPH
 *  0ms     hidden until the layout settles, then the stage fades in
 *  hover   the neighborhood stays bright
 *  select  the inspector crossfades to that entity
 */

import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EntityGroup } from '@/lib/dreams/entities';

import { EntityGraphFrame } from './entity-graph-frame';
import { EntityInspector } from './entity-inspector';
import { backboneKeys } from './graph-backbone';
import { countLabel, endpoint } from './graph-labels';
import { useEntitySpheres } from './graph-spheres';
import { readGraphColors } from './graph-colors';
import {
  buildGraph,
  retainGraphPositions,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from './graph-data';
import {
  GRAPH_SCENE,
  frameGraph,
  neighborhood,
  paintLink,
  showLink,
  showNode,
  tuneGraph,
  zoomGraph,
} from './graph-scene';

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };
const KINDS = [
  ['person', 'People'],
  ['project', 'Projects'],
  ['customer', 'Customers'],
  ['decision', 'Decisions'],
] as const;

export default function EntityGraphCanvas({
  groups,
  active,
}: {
  groups: readonly EntityGroup[];
  active: boolean;
}) {
  const [graphState, setGraphState] = useState(() => ({ groups, graph: buildGraph(groups) }));
  if (groups !== graphState.groups) {
    setGraphState({ groups, graph: retainGraphPositions(buildGraph(groups), graphState.graph) });
  }
  const graph = graphState.graph;
  const backbone = useMemo(() => {
    const kinds = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.kind === 'entity' && node.entityKind) kinds.set(node.id, node.entityKind);
    }
    return backboneKeys(graph.links, kinds);
  }, [graph]);
  const backboneRef = useRef(backbone);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const focusId = hoveredLink ? null : (hoveredNode?.id ?? selectedNode?.id ?? null);
  const focus = hoveredLink
    ? new Set([endpoint(hoveredLink.source), endpoint(hoveredLink.target)])
    : neighborhood(graph.links, focusId);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFittedInitialGraph = useRef(false);
  const [prepared, setPrepared] = useState(false);
  const [fitted, setFitted] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<ReturnType<typeof readGraphColors> | null>(null);
  const entities = graph.nodes.filter((node) => node.kind === 'entity');
  const documentCount = graph.nodes.filter((node) => node.kind === 'document').length;
  const summary = active
    ? `Dream in progress · ${countLabel(entities.length, 'entity')} · ${countLabel(documentCount, 'file')}`
    : `${countLabel(entities.length, 'entity')} · ${countLabel(documentCount, 'file')} · ${countLabel(graph.links.length, 'link')}`;
  const entityColor = (kind: string) => {
    if (!colors) return 'var(--muted-foreground)';
    if (kind === 'project') return colors.project;
    if (kind === 'customer') return colors.customer;
    if (kind === 'decision') return colors.decision;
    return colors.person;
  };
  const selectNode = (node: GraphNode) => {
    setSelectedNode(node);
    setHoveredNode(null);
    setHoveredLink(null);
  };
  const motionMs = reduceMotion ? 0 : 220;
  const overlay = hoveredLink
    ? {
        key: 'link',
        title: 'Files in common',
        detail: hoveredLink.sharedFiles.slice(0, 3).join(' · '),
      }
    : hoveredNode
      ? {
          key: hoveredNode.id,
          title: hoveredNode.label,
          detail: `${hoveredNode.entityKind ?? 'entity'} · ${countLabel(hoveredNode.documents?.length ?? 0, 'file')}`,
        }
      : null;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduceMotion(media.matches);
    updateMotion();
    media.addEventListener('change', updateMotion);
    const updateColors = () => setColors(readGraphColors());
    const frame = requestAnimationFrame(updateColors);
    const observer = new MutationObserver(updateColors);
    const resize = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    if (containerRef.current) resize.observe(containerRef.current);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      media.removeEventListener('change', updateMotion);
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!selectedNode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedNode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNode]);

  useLayoutEffect(() => {
    backboneRef.current = backbone;
  }, [backbone]);

  const nodeObject = useEntitySpheres(graph.nodes, colors, focus, kindFilter, focusId);

  useLayoutEffect(() => {
    const instance = graphRef.current;
    if (!instance || prepared) return;
    tuneGraph(instance, () => backboneRef.current);
    setPrepared(true);
  }, [prepared, colors, size.width, size.height]);

  useEffect(() => {
    if (!fitted || !colors || size.width === 0 || size.height === 0) return;
    const instance = graphRef.current;
    if (!instance) return;
    frameGraph(instance);
  }, [fitted, colors, size.width, size.height]);

  const withGraph = (run: (graph: ForceGraphMethods<GraphNode, GraphLink>) => void) => {
    const instance = graphRef.current;
    if (instance) run(instance);
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Entity graph">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div role="group" aria-label="Graph legend" className="flex flex-wrap items-center gap-1">
          {KINDS.map(([kind, label]) => {
            const pressed = kindFilter === kind;
            const total = entities.filter((node) => node.entityKind === kind).length;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={pressed}
                onClick={() => setKindFilter(pressed ? null : kind)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors motion-reduce:transition-none ${pressed ? 'bg-muted text-foreground ring-1 ring-border' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: entityColor(kind) }}
                />
                {label}
                <span className="text-tertiary-foreground tabular-nums">{total}</span>
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-px w-4"
              style={{ backgroundColor: colors?.document ?? 'var(--graph-document)' }}
            />
            Shared files
          </span>
        </div>
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
          {summary}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:h-[min(42rem,calc(100svh-15rem))] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <EntityGraphFrame
          containerRef={containerRef}
          fitted={fitted}
          empty={graph.nodes.length === 0}
          active={active}
          overlay={overlay}
          onZoomIn={() =>
            withGraph((instance) => zoomGraph(instance, GRAPH_SCENE.zoomIn, motionMs))
          }
          onZoomOut={() =>
            withGraph((instance) => zoomGraph(instance, GRAPH_SCENE.zoomOut, motionMs))
          }
          onFit={() => withGraph((instance) => frameGraph(instance))}
        >
          {colors && size.width > 0 && size.height > 0 ? (
            <ForceGraph3D
              ref={graphRef}
              graphData={prepared ? graph : EMPTY_GRAPH}
              backgroundColor={`${colors.background}00`}
              width={size.width}
              height={size.height}
              numDimensions={2}
              warmupTicks={GRAPH_SCENE.warmupTicks}
              cooldownTicks={0}
              showNavInfo={false}
              showPointerCursor
              enableNodeDrag={false}
              nodeRelSize={GRAPH_SCENE.nodeRelSize}
              nodeResolution={GRAPH_SCENE.nodeResolution}
              nodeOpacity={1}
              linkOpacity={GRAPH_SCENE.linkOpacity}
              nodeLabel=""
              nodeThreeObject={nodeObject}
              nodeVisibility={(node) => showNode(node as GraphNode)}
              linkVisibility={(link) => showLink(link as GraphLink, focusId, backbone)}
              linkColor={(link) => paintLink(link as GraphLink, colors, focus)}
              linkWidth={focus ? GRAPH_SCENE.focusLinkWidth : GRAPH_SCENE.restLinkWidth}
              onNodeHover={(node) => {
                setHoveredNode((node as GraphNode | null) ?? null);
                setHoveredLink(null);
              }}
              onNodeClick={(node) => selectNode(node as GraphNode)}
              onLinkHover={(link) => {
                setHoveredLink((link as GraphLink | null) ?? null);
                setHoveredNode(null);
              }}
              onBackgroundClick={() => {
                setSelectedNode(null);
                setHoveredNode(null);
                setHoveredLink(null);
              }}
              onEngineStop={() => {
                if (!prepared || hasFittedInitialGraph.current) return;
                hasFittedInitialGraph.current = true;
                requestAnimationFrame(() => {
                  const instance = graphRef.current;
                  if (!instance) return;
                  frameGraph(instance);
                  setFitted(true);
                });
              }}
            />
          ) : null}
        </EntityGraphFrame>

        <EntityInspector
          nodes={graph.nodes}
          links={graph.links}
          selectedId={selectedNode?.id ?? null}
          kindFilter={kindFilter}
          colorFor={entityColor}
          onSelect={selectNode}
        />
      </div>
    </section>
  );
}
