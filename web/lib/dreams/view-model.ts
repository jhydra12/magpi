import type { Tables } from '@/lib/database.types';

import {
  describeDreamKind,
  describeDreamStatus,
  formatRunDuration,
  type DreamKind,
  type DreamStatusView,
} from './status';

export type DreamRunRecord = Pick<
  Tables<'dream_runs'>,
  | 'id'
  | 'space_id'
  | 'kind'
  | 'status'
  | 'started_at'
  | 'finished_at'
  | 'input_document_count'
  | 'output_document_id'
  | 'error'
  | 'triggered_by'
  | 'created_at'
>;

export type SpaceRecord = Pick<Tables<'spaces'>, 'id' | 'name' | 'dreaming_enabled'>;

export type DreamLinkRecord = Pick<
  Tables<'dream_links'>,
  'id' | 'document_a' | 'document_b' | 'similarity' | 'rationale' | 'confirmed_at' | 'dismissed_at'
>;

export type DocumentRecord = Pick<Tables<'documents'>, 'id' | 'title' | 'url' | 'origin'>;

export type DreamRunSummary = {
  readonly id: string;
  readonly kind: DreamKind;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly kindLabel: string;
  readonly inputSummary: string;
  readonly inputDocumentCount: number;
  readonly outputDocumentId: string | null;
  readonly duration: string;
  readonly createdAt: string;
  readonly status: DreamStatusView;
};

function summarizeInputs(count: number): string {
  if (count === 0) return 'No documents';
  return `${count} document${count === 1 ? '' : 's'}`;
}

export function buildRunSummaries({
  runs,
  spaces,
}: {
  readonly runs: readonly DreamRunRecord[];
  readonly spaces: readonly SpaceRecord[];
}): readonly DreamRunSummary[] {
  const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));

  return runs.flatMap((run) => {
    const spaceName = spaceNames.get(run.space_id);
    if (!spaceName) return [];

    const kind = describeDreamKind(run.kind);

    return [
      {
        id: run.id,
        kind: run.kind,
        spaceId: run.space_id,
        spaceName,
        kindLabel: kind.label,
        inputSummary: summarizeInputs(run.input_document_count),
        inputDocumentCount: run.input_document_count,
        outputDocumentId: run.output_document_id,
        duration: formatRunDuration(run.started_at, run.finished_at),
        createdAt: run.created_at,
        status: describeDreamStatus({
          status: run.status,
          error: run.error,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
        }),
      },
    ];
  });
}

export type LinkState = 'pending' | 'confirmed' | 'dismissed';

export type LinkedDocument = {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
};

export type LinkCandidate = {
  readonly id: string;
  readonly documentA: LinkedDocument;
  readonly documentB: LinkedDocument;
  readonly similarityLabel: string;
  readonly rationale: string;
  readonly state: LinkState;
};

function linkState(link: DreamLinkRecord): LinkState {
  if (link.confirmed_at) return 'confirmed';
  if (link.dismissed_at) return 'dismissed';
  return 'pending';
}

export function buildLinkCandidates({
  links,
  documents,
}: {
  readonly links: readonly DreamLinkRecord[];
  readonly documents: readonly DocumentRecord[];
}): readonly LinkCandidate[] {
  const byId = new Map(documents.map((document) => [document.id, document]));

  return links.flatMap((link) => {
    const a = byId.get(link.document_a);
    const b = byId.get(link.document_b);
    // Handles a torn read: links and documents are two queries, so a side can go missing.
    if (!a || !b) return [];

    return [
      {
        id: link.id,
        documentA: { id: a.id, title: a.title, url: a.url },
        documentB: { id: b.id, title: b.title, url: b.url },
        similarityLabel: `${Math.round(link.similarity * 100)}% similar`,
        rationale: link.rationale ?? 'The run recorded no rationale for this pair.',
        state: linkState(link),
      },
    ];
  });
}
