'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

import { connectedEntities } from './graph-scene';
import type { GraphLink, GraphNode } from './graph-data';

const KIND_ORDER = ['person', 'project', 'customer', 'decision'] as const;

const KIND_LABEL: Record<(typeof KIND_ORDER)[number], string> = {
  person: 'People',
  project: 'Projects',
  customer: 'Customers',
  decision: 'Decisions',
};

const KIND_NOUN: Record<(typeof KIND_ORDER)[number], string> = {
  person: 'Person',
  project: 'Project',
  customer: 'Customer',
  decision: 'Decision',
};

function kindNoun(kind: string | undefined): string {
  if (kind === 'person' || kind === 'project' || kind === 'customer' || kind === 'decision') {
    return KIND_NOUN[kind];
  }
  return 'Entity';
}

function fileCount(total: number): string {
  return `${total} ${total === 1 ? 'file' : 'files'}`;
}

/** The readable side of the map: search, the selected entity, and the full list. */
export function EntityInspector({
  nodes,
  links,
  selectedId,
  kindFilter,
  colorFor,
  onSelect,
}: {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
  selectedId: string | null;
  kindFilter: string | null;
  colorFor: (kind: string) => string;
  onSelect: (node: GraphNode) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedRef = useRef<HTMLButtonElement>(null);
  const entities = useMemo(() => nodes.filter((node) => node.kind === 'entity'), [nodes]);
  const selected = entities.find((node) => node.id === selectedId) ?? null;
  const needle = query.trim().toLowerCase();
  const visible = entities.filter((node) => {
    if (kindFilter && node.entityKind !== kindFilter) return false;
    if (!needle) return true;
    return node.label.toLowerCase().includes(needle);
  });
  const connections = useMemo(
    () => (selected ? connectedEntities(selected.id, links, entities) : []),
    [selected, links, entities],
  );

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <aside className="flex h-80 min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-full">
      <div className="border-b border-border p-2.5">
        <Input
          type="search"
          name="entity-search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Find an entity…"
          aria-label="Find an entity"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8"
        />
      </div>

      <div className="border-b border-border px-3 py-3">
        {selected ? (
          <div
            key={selected.id}
            className="animate-in duration-150 fade-in motion-reduce:animate-none"
          >
            <p className="text-xs text-muted-foreground">{kindNoun(selected.entityKind)}</p>
            <h2
              className="font-heading text-base font-medium text-balance text-foreground"
              translate="no"
            >
              {selected.label}
            </h2>
            {selected.summary ? (
              <p className="mt-1 line-clamp-3 text-sm text-pretty text-muted-foreground">
                {selected.summary}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground tabular-nums">
              {fileCount(selected.documents?.length ?? 0)}
            </p>
            {selected.documents?.length ? (
              <ul className="mt-1.5 flex max-h-28 flex-col gap-1 overflow-y-auto">
                {selected.documents.map((document) => (
                  <li key={document.id} className="min-w-0">
                    <Link
                      href={`/documents/${document.id}`}
                      className="block truncate text-sm text-brand-link hover:underline"
                    >
                      {document.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No files you can see.</p>
            )}
            {connections.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Shares files with</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {connections.slice(0, 5).map((connection) => (
                    <li key={connection.id} className="flex min-w-0 items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorFor(connection.entityKind) }}
                      />
                      <span className="truncate" translate="no">
                        {connection.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an entity to see the files it shares.
          </p>
        )}
      </div>

      <ul aria-label="Graph entities" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {visible.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            No entities match.
          </li>
        ) : (
          KIND_ORDER.map((kind) => {
            const group = visible.filter((node) => node.entityKind === kind);
            if (group.length === 0) return null;
            return (
              <li key={kind}>
                <p className="px-2 pt-2 pb-1 text-xs text-tertiary-foreground">
                  {KIND_LABEL[kind]}
                  <span className="ml-1.5 tabular-nums">{` ${group.length}`}</span>
                </p>
                <ul>
                  {group.map((node) => {
                    const current = node.id === selectedId;
                    return (
                      <li
                        key={node.id}
                        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 32px' }}
                      >
                        <button
                          ref={current ? selectedRef : undefined}
                          type="button"
                          aria-current={current ? 'true' : undefined}
                          onClick={() => onSelect(node)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? 'bg-muted' : ''}`}
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: colorFor(node.entityKind ?? '') }}
                          />
                          <span className="min-w-0 flex-1 truncate" translate="no">
                            {node.label}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {node.documents?.length ?? 0}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
