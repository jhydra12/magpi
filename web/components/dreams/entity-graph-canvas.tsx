'use client';

import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { useEffect, useRef, useState } from 'react';

import type { EntityGroup } from '@/lib/dreams/entities';

import { readGraphColors } from './graph-colors';

import { buildGraph, retainGraphPositions, type GraphNode, type GraphLink } from './graph-data';

export default function EntityGraphCanvas({ groups }: { groups: readonly EntityGroup[] }) {
  const [graphState, setGraphState] = useState(() => ({ groups, graph: buildGraph(groups) }));
  if (groups !== graphState.groups) {
    setGraphState({ groups, graph: retainGraphPositions(buildGraph(groups), graphState.graph) });
  }
  const graph = graphState.graph;
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isArranging, setIsArranging] = useState(true);
  const detailNode = hoveredNode ?? selectedNode;
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFittedInitialGraph = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<ReturnType<typeof readGraphColors> | null>(null);
  const entities = graph.nodes.filter((node) => node.kind === 'entity');
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
    if (typeof node.x === 'number' && typeof node.y === 'number' && typeof node.z === 'number') {
      graphRef.current?.zoomToFit(700, 120, (candidate) => candidate.id === node.id);
    }
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
    const timeout = window.setTimeout(() => setIsArranging(false), 5000);
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const frame = requestAnimationFrame(() => graphRef.current?.zoomToFit(350, 48));
    return () => cancelAnimationFrame(frame);
  }, [size.width, size.height]);

  return (
    <section
      className="relative overflow-hidden rounded-[var(--radius-panel)] border border-border bg-background"
      aria-label="Entity graph"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
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
            <span aria-hidden="true" className="size-2.5 rounded-full bg-muted-foreground" />
            Files
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-px w-4"
              style={{ backgroundColor: colors?.link ?? 'var(--primary)' }}
            />
            Shared files
          </span>
        </div>
        <details className="relative z-20">
          <summary className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted">
            Browse entities ({entities.length})
          </summary>
          <div className="absolute top-full right-0 mt-2 max-h-72 max-w-[min(22rem,calc(100vw-2rem))] min-w-64 overflow-y-auto rounded-lg border border-border bg-background p-2 shadow-lg">
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
      </header>
      <div
        ref={containerRef}
        className="entity-graph-stage h-[clamp(22rem,70svh,42.5rem)] w-full overflow-hidden"
      >
        {colors && size.width > 0 && size.height > 0 ? (
          <ForceGraph3D
            ref={graphRef}
            graphData={graph}
            backgroundColor={`${colors.background}00`}
            width={size.width}
            height={size.height}
            cooldownTime={5000}
            showNavInfo={false}
            nodeLabel={(node) => {
              const item = node as GraphNode;
              return item.kind === 'document' ? item.label : `${item.label} · ${item.entityKind}`;
            }}
            nodeColor={(node) => {
              const item = node as GraphNode;
              return item.kind === 'document'
                ? colors.document
                : item.entityKind === 'project'
                  ? colors.project
                  : item.entityKind === 'customer'
                    ? colors.customer
                    : item.entityKind === 'decision'
                      ? colors.decision
                      : colors.person;
            }}
            nodeVal={(node) => ((node as GraphNode).kind === 'entity' ? 5 : 1.4)}
            linkColor={(link) =>
              (link as GraphLink).kind === 'shared' ? colors.link : colors.document
            }
            linkWidth={(link) => ((link as GraphLink).kind === 'shared' ? 1.8 : 0.45)}
            linkDirectionalParticles={(link) => ((link as GraphLink).kind === 'shared' ? 2 : 0)}
            linkDirectionalParticleSpeed={0.005}
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
              setIsArranging(false);
              if (!hasFittedInitialGraph.current) {
                graphRef.current?.zoomToFit(500, 48);
                hasFittedInitialGraph.current = true;
              }
            }}
          />
        ) : null}
      </div>
      {isArranging ? (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-foreground/[0.04]" />
      ) : null}
      {detailNode || hoveredLink ? (
        <aside className="border-t border-border bg-background px-4 py-3 text-sm">
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
