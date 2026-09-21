'use client';

import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { EntityGroup } from '@/lib/dreams/entities';

import { readGraphColors } from './graph-colors';

import { buildGraph, retainGraphPositions, type GraphNode, type GraphLink } from './graph-data';
import { placeCamera } from './graph-camera';

/**
 * Three turns at 60 / speed seconds, so this is a full turn in a little under a minute: enough
 * to read the shape as it comes round, slow enough that a label stays readable.
 */
const ROTATION_SPEED = 1.125;

/** Orbit controls, as far as this component uses them. */
interface OrbitLike {
  autoRotate: boolean;
  autoRotateSpeed: number;
}

/** The renderer types its camera as the base class, which does not declare a far plane. */
type PerspectiveLike = { far: number; updateProjectionMatrix(): void };

/**
 * A link's ends are ids until the renderer has run, and the node objects themselves afterwards,
 * because it resolves them in place. Either way this is the id.
 */
function endId(end: GraphLink['source']): string {
  return typeof end === 'string' ? end : ((end as unknown as GraphNode).id ?? '');
}

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
  const wholeGraph = graphState.graph;
  // Files are most of the lines on screen: one per name in each of them, and none of them say
  // anything a person is reading the graph for. Off by default, and one click away.
  const [showFiles, setShowFiles] = useState(false);
  const { graph, degrees } = useMemo(() => {
    const links = showFiles
      ? wholeGraph.links
      : wholeGraph.links.filter((link) => link.kind !== 'mention');
    const counts = new Map<string, number>();
    for (const link of links) {
      for (const end of [endId(link.source), endId(link.target)]) {
        counts.set(end, (counts.get(end) ?? 0) + 1);
      }
    }
    // A name with nothing left to join it to says nothing on a graph, and hundreds of them
    // scattered around the edge are what makes one hard to read. They stay in Browse entities.
    const nodes = wholeGraph.nodes.filter(
      (node) => (showFiles || node.kind !== 'document') && counts.has(node.id),
    );
    return { graph: { nodes, links }, degrees: counts };
  }, [wholeGraph, showFiles]);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const detailNode = hoveredNode ?? selectedNode;
  const containerRef = useRef<HTMLDivElement>(null);
  const ticks = useRef(0);
  // Turning would fight the camera move that framing a chosen node makes, so it waits.
  const isRotating = selectedNode === null;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<ReturnType<typeof readGraphColors> | null>(null);
  const entities = wholeGraph.nodes.filter((node) => node.kind === 'entity');
  const documentCount = wholeGraph.nodes.filter((node) => node.kind === 'document').length;
  const count = (total: number, noun: string) =>
    `${total} ${total === 1 ? noun : noun === 'entity' ? 'entities' : `${noun}s`}`;
  // The settled line counts what is drawn; Browse entities beside it still lists every name.
  const drawn = graph.nodes.filter((node) => node.kind === 'entity').length;
  const summary = active
    ? `Dream in progress · ${count(entities.length, 'entity')} · ${count(documentCount, 'file')}`
    : `${count(drawn, 'entity')} · ${count(documentCount, 'file')} · ${count(graph.links.length, 'link')}`;
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
  /** Frames the whole graph from the tilt it turns through. */
  const frameGraph = (transitionMs: number) => {
    const graphApi = graphRef.current;
    if (!graphApi || size.height === 0) return;
    const placement = placeCamera(graph.nodes, size.width / size.height);
    if (!placement) return;

    // The renderer's own far plane is 2000, and a graph of a few hundred names is framed from
    // further out than that, which draws nothing at all. The plane follows the fit.
    const reach = Math.hypot(
      placement.position.x - placement.lookAt.x,
      placement.position.y - placement.lookAt.y,
      placement.position.z - placement.lookAt.z,
    );
    const camera = graphApi.camera() as unknown as PerspectiveLike | undefined;
    if (camera && camera.far < reach * 2) {
      camera.far = reach * 2;
      camera.updateProjectionMatrix();
    }
    graphApi.cameraPosition(placement.position, placement.lookAt, transitionMs);
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
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const frame = requestAnimationFrame(() => frameGraph(350));
    return () => cancelAnimationFrame(frame);
    // Reframed on resize, not on every simulation tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // Orbit controls turn the graph; the renderer already calls update() every frame.
  useEffect(() => {
    const controls = graphRef.current?.controls() as OrbitLike | undefined;
    if (!controls) return;
    controls.autoRotate = isRotating;
    controls.autoRotateSpeed = ROTATION_SPEED;
  }, [isRotating, colors, size.width]);

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
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <input
              type="checkbox"
              checked={showFiles}
              onChange={(event) => setShowFiles(event.target.checked)}
              className="size-3 accent-[var(--graph-document)]"
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: colors?.document ?? 'var(--graph-document)' }}
            />
            Files
          </label>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-px w-4"
              style={{ backgroundColor: colors?.shared ?? 'var(--graph-shared)' }}
            />
            Shared files
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {summary}
          </p>
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
        </div>
      </header>
      <div
        ref={containerRef}
        className="entity-graph-stage h-[clamp(22rem,70svh,42.5rem)] w-full overflow-hidden"
      >
        {graph.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {active ? 'Waiting for the first entities' : 'No entities yet'}
          </div>
        ) : colors && size.width > 0 && size.height > 0 ? (
          <ForceGraph3D
            ref={graphRef}
            graphData={graph}
            backgroundColor={`${colors.background}00`}
            width={size.width}
            height={size.height}
            cooldownTime={5000}
            showNavInfo={false}
            controlType="orbit"
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
            nodeVal={(node) => {
              const item = node as GraphNode;
              // A name that ties many files together should read as the hub it is.
              return item.kind === 'document'
                ? 1.2
                : 3 + Math.min(12, (degrees.get(item.id) ?? 0) * 0.5);
            }}
            linkColor={(link) =>
              (link as GraphLink).kind === 'shared' ? colors.shared : colors.document
            }
            linkOpacity={0.35}
            linkWidth={(link) => {
              const item = link as GraphLink;
              // Width carries the weight, so a tie backed by four files reads louder than one
              // backed by a single file, instead of every line shouting equally.
              return item.kind === 'shared' ? Math.min(3.2, 0.7 + (item.weight ?? 1) * 0.7) : 0.25;
            }}
            linkDirectionalParticles={(link) =>
              (link as GraphLink).kind === 'shared' && ((link as GraphLink).weight ?? 1) > 2 ? 2 : 0
            }
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
            onEngineTick={() => {
              // The layout has no coordinates until it has run, so the fit cannot be done once
              // on mount. Reframing as it settles also lets a person watch it find its shape.
              ticks.current += 1;
              if (ticks.current % 10 === 0) frameGraph(0);
            }}
            onEngineStop={() => frameGraph(400)}
          />
        ) : null}
      </div>
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
