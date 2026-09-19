'use client';

import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { EntityGroup } from '@/lib/dreams/entities';

type GraphNode = {
  id: string;
  label: string;
  kind: 'entity' | 'document';
  entityKind?: string;
  documents?: string[];
  title?: string;
};

type GraphLink = {
  source: string;
  target: string;
  kind: 'mention' | 'shared';
  sharedFiles: string[];
};

type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

function entityKey(kind: string, name: string): string {
  return `${kind}:${name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}`;
}

function readToken(token: string): string {
  if (typeof document === 'undefined') return token;
  const name = token.match(/^var\((--[^)]+)\)$/)?.[1];
  if (!name) return token;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return 'transparent';
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return value;
  context.fillStyle = value;
  return context.fillStyle;
}

const ENTITY_COLORS: Record<string, string> = {
  person: 'var(--primary)',
  project: 'var(--demo)',
  customer: 'var(--accent)',
  decision: 'var(--destructive)',
};

export function buildGraph(groups: readonly EntityGroup[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const documents = new Map<string, { title: string; entities: string[] }>();
  const entities = new Map<string, GraphNode>();

  for (const group of groups) {
    for (const entity of group.entities) {
      const key = entityKey(group.kind, entity.name);
      const entityNode = entities.get(key) ?? {
        id: `entity:${key}`,
        label: entity.name,
        kind: 'entity' as const,
        entityKind: group.kind,
        documents: [],
      };
      entityNode.documents = [
        ...new Set([
          ...(entityNode.documents ?? []),
          ...entity.documents.map((document) => document.title),
        ]),
      ];
      if (!entities.has(key)) {
        nodes.push(entityNode);
        entities.set(key, entityNode);
      }
      for (const document of entity.documents) {
        const entry = documents.get(document.id) ?? { title: document.title, entities: [] };
        if (!entry.entities.includes(key)) entry.entities.push(key);
        documents.set(document.id, entry);
      }
    }
  }

  for (const [documentId, document] of documents) {
    nodes.push({
      id: `document:${documentId}`,
      label: document.title,
      kind: 'document',
      title: document.title,
    });
    for (const entityId of document.entities) {
      links.push({
        source: `entity:${entityId}`,
        target: `document:${documentId}`,
        kind: 'mention',
        sharedFiles: [document.title],
      });
    }
  }

  const entityIds = [...entities.keys()];
  for (let index = 0; index < entityIds.length; index += 1) {
    for (const otherId of entityIds.slice(index + 1)) {
      const left = entities.get(entityIds[index]);
      const right = entities.get(otherId);
      if (!left || !right) continue;
      const rightFiles = new Set(
        [...documents.values()]
          .filter((document) => document.entities.includes(otherId))
          .map((document) => document.title),
      );
      const sharedFiles = [...documents.values()]
        .filter(
          (document) =>
            document.entities.includes(entityIds[index]) && rightFiles.has(document.title),
        )
        .map((document) => document.title);
      if (sharedFiles.length > 0) {
        links.push({
          source: left.id,
          target: right.id,
          kind: 'shared',
          sharedFiles,
        });
      }
    }
  }
  return { nodes, links };
}

export default function EntityGraphCanvas({ groups }: { groups: readonly EntityGroup[] }) {
  const graph = useMemo(() => buildGraph(groups), [groups]);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [isArranging, setIsArranging] = useState(true);
  const detailNode = hoveredNode;
  const [backgroundColor, setBackgroundColor] = useState(() => readToken('var(--background)'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setBackgroundColor(readToken('var(--background)'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const timeout = window.setTimeout(() => setIsArranging(false), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [graph]);

  return (
    <section
      className="relative overflow-hidden rounded-[var(--radius-panel)] border border-border bg-(--muted)"
      aria-label="Entity graph"
    >
      <div className="h-[min(70vh,680px)] min-h-[520px] w-full overflow-hidden">
        <div className="h-full w-full -translate-x-[32%] -translate-y-[32%]">
          <ForceGraph3D
            ref={graphRef}
            graphData={graph}
            backgroundColor={backgroundColor}
            showNavInfo={false}
            nodeLabel={(node) => {
              const item = node as GraphNode;
              return item.kind === 'document' ? item.label : `${item.label} · ${item.entityKind}`;
            }}
            nodeColor={(node) => {
              const item = node as GraphNode;
              return item.kind === 'document'
                ? readToken('var(--muted-foreground)')
                : readToken(ENTITY_COLORS[item.entityKind ?? 'person']);
            }}
            nodeVal={(node) => ((node as GraphNode).kind === 'entity' ? 5 : 1.4)}
            linkColor={(link) =>
              (link as GraphLink).kind === 'shared'
                ? readToken('var(--primary)')
                : readToken('var(--muted-foreground)')
            }
            linkWidth={(link) => ((link as GraphLink).kind === 'shared' ? 1.8 : 0.45)}
            linkDirectionalParticles={(link) => ((link as GraphLink).kind === 'shared' ? 2 : 0)}
            linkDirectionalParticleSpeed={0.005}
            onNodeHover={(node) => {
              setHoveredNode((node as GraphNode | null) ?? null);
              setHoveredLink(null);
            }}
            onLinkHover={(link) => {
              setHoveredLink((link as GraphLink | null) ?? null);
              setHoveredNode(null);
            }}
            onEngineStop={() => {
              setIsArranging(false);
              graphRef.current?.zoomToFit(500, 48);
            }}
          />
        </div>
      </div>
      {isArranging ? (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-foreground/[0.04]" />
      ) : null}
      {detailNode || hoveredLink ? (
        <aside className="absolute bottom-5 left-5 z-10 max-w-sm rounded-[var(--radius-panel)] border border-border bg-background/95 px-4 py-3 text-sm shadow-sm">
          {hoveredLink ? (
            <>
              <p className="font-medium text-foreground">Files in common</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {hoveredLink.sharedFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </>
          ) : detailNode ? (
            <>
              <p className="font-medium text-foreground">{detailNode.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {detailNode.kind === 'entity'
                  ? `${detailNode.entityKind} · ${detailNode.documents?.length ?? 0} files`
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
