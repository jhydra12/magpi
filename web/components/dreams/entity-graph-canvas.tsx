'use client';

import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { EntityGroup } from '@/lib/dreams/entities';

import { readGraphColors } from './graph-colors';
import {
  buildGraph,
  retainGraphPositions,
  type GraphData,
  type GraphNode,
  type GraphLink,
} from './graph-data';
import {
  GRAPH_SCENE,
  frameGraph,
  neighborhood,
  paintLink,
  paintNode,
  showLink,
  showNode,
  tuneGraph,
} from './graph-scene';

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

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
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const detailNode = hoveredNode ?? selectedNode;
  const focus = neighborhood(graph.links, detailNode?.id ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFittedInitialGraph = useRef(false);
  const [prepared, setPrepared] = useState(false);
  const [fitted, setFitted] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<ReturnType<typeof readGraphColors> | null>(null);
  const entities = graph.nodes.filter((node) => node.kind === 'entity');
  const documentCount = graph.nodes.filter((node) => node.kind === 'document').length;
  const count = (total: number, noun: string) =>
    `${total} ${total === 1 ? noun : noun === 'entity' ? 'entities' : `${noun}s`}`;
  const summary = active
    ? `Dream in progress · ${count(entities.length, 'entity')} · ${count(documentCount, 'file')}`
    : `${count(entities.length, 'entity')} · ${count(documentCount, 'file')} · ${count(graph.links.length, 'link')}`;
  const entityColor = (kind: string) => {
    if (!colors) return 'var(--muted-foreground)';
    return kind === 'project'
      ? colors.project
      : kind === 'customer'
        ? colors.customer
        : kind === 'decision'
          ? colors.decision
          : colors.person;
  };
  const selectNode = (node: GraphNode) => {
    setSelectedNode(node);
    setHoveredNode(null);
    setHoveredLink(null);
  };

  useEffect(() => {
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
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    const instance = graphRef.current;
    if (!instance || prepared) return;
    tuneGraph(instance);
    setPrepared(true);
  }, [prepared, colors, size.width, size.height]);

  useEffect(() => {
    if (!fitted || !colors || size.width === 0 || size.height === 0) return;
    const instance = graphRef.current;
    if (!instance) return;
    frameGraph(instance);
  }, [fitted, colors, size.width, size.height]);

  return (
    <section className="flex flex-col gap-3" aria-label="Entity graph">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div
          role="group"
          aria-label="Graph legend"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
        >
          {[
            ['person', 'People'],
            ['project', 'Projects'],
            ['customer', 'Customers'],
            ['decision', 'Decisions'],
          ].map(([kind, label]) => (
            <span key={kind} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: entityColor(kind) }}
              />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-px w-4"
              style={{ backgroundColor: colors?.document ?? 'var(--graph-document)' }}
            />
            Shared files
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {summary}
          </p>
          <details className="relative z-20">
            <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
              Browse entities ({entities.length})
            </summary>
            <div className="absolute top-full right-0 z-20 mt-1 max-h-72 max-w-[min(22rem,calc(100vw-2rem))] min-w-64 origin-top-right overflow-y-auto rounded-lg border border-border bg-popover p-1">
              <ul aria-label="Graph entities" className="flex flex-col gap-1">
                {entities.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      aria-label={`${node.label}, ${node.entityKind}, ${node.documents?.length ?? 0} files`}
                      aria-current={selectedNode?.id === node.id ? 'true' : undefined}
                      onClick={() => selectNode(node)}
                      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: entityColor(node.entityKind ?? '') }}
                        />
                        <span className="truncate">{node.label}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {node.documents?.length ?? 0} files
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </header>
      <div
        ref={containerRef}
        className={`entity-graph-stage h-[clamp(16rem,42svh,26rem)] w-full overflow-hidden${fitted ? '' : 'opacity-0'}`}
      >
        {graph.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {active ? 'Waiting for the first entities' : 'No entities yet'}
          </div>
        ) : colors && size.width > 0 && size.height > 0 ? (
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
            nodeRelSize={GRAPH_SCENE.nodeRelSize}
            nodeResolution={GRAPH_SCENE.nodeResolution}
            nodeOpacity={1}
            linkOpacity={GRAPH_SCENE.linkOpacity}
            nodeLabel=""
            nodeVisibility={(node) => showNode(node as GraphNode)}
            linkVisibility={(link) => showLink(link as GraphLink, detailNode?.id ?? null)}
            nodeColor={(node) => paintNode(node as GraphNode, colors, focus)}
            nodeVal={(node) =>
              (node as GraphNode).kind === 'entity' ? GRAPH_SCENE.entityVal : GRAPH_SCENE.fileVal
            }
            linkColor={(link) => paintLink(link as GraphLink, colors, focus)}
            linkWidth={0.22}
            onNodeHover={(node) => {
              setHoveredNode((node as GraphNode | null) ?? null);
              setHoveredLink(null);
            }}
            onNodeClick={(node) => selectNode(node as GraphNode)}
            onLinkHover={(link) => {
              setHoveredLink((link as GraphLink | null) ?? null);
              setHoveredNode(null);
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
      </div>
      {detailNode || hoveredLink ? (
        <aside className="text-sm">
          {hoveredLink ? (
            <>
              <p className="font-medium text-foreground">Files in common</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {hoveredLink.sharedFiles.map((file, index) => (
                  <li key={`${index}:${file}`}>{file}</li>
                ))}
              </ul>
            </>
          ) : detailNode ? (
            <>
              <p className="font-medium text-foreground">{detailNode.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {detailNode.kind === 'entity'
                  ? `${detailNode.entityKind} · ${detailNode.documents?.length ?? 0} ${detailNode.documents?.length === 1 ? 'file' : 'files'}`
                  : 'file'}
              </p>
              {detailNode.documents?.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {detailNode.documents.slice(0, 5).join(' · ')}
                </p>
              ) : null}
            </>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
