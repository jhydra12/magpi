import 'server-only';

import type { SessionContext } from '@/lib/supabase/context';

import { describeDreamOutput } from './citations';
import { buildEntityGroups, type EntityGroup } from './entities';
import {
  buildNightlyDreams,
  DREAM_MODEL_PURPOSES,
  type ModelCallRecord,
  type NightlyDream,
} from './nightly';
import {
  buildLinkCandidates,
  buildRunSummaries,
  type DreamRunRecord,
  type DreamRunSummary,
  type LinkCandidate,
  type SpaceRecord,
} from './view-model';

const RUN_COLUMNS =
  'id, space_id, kind, status, started_at, finished_at, input_document_count, output_document_id, error, triggered_by, created_at';

async function fetchSpaces(context: SessionContext): Promise<readonly SpaceRecord[]> {
  const { data, error } = await context.supabase
    .from('spaces')
    .select('id, name, dreaming_enabled')
    .order('name');
  if (error) throw new Error(`Could not read spaces: ${error.message}`);
  return data;
}

export type DreamsPageData = {
  readonly nights: readonly NightlyDream[];
  readonly spaces: readonly SpaceRecord[];
};

/** Three passes a night per space, so 150 rows is fifty nights of one space or a few weeks of several. */
const RUN_LIMIT = 150;

export async function loadDreamsPage(context: SessionContext): Promise<DreamsPageData> {
  const [spaces, runs] = await Promise.all([
    fetchSpaces(context),
    context.supabase
      .from('dream_runs')
      .select(RUN_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(RUN_LIMIT),
  ]);

  if (runs.error) throw new Error(`Could not read dream runs: ${runs.error.message}`);

  const runIds = runs.data.map((run) => run.id);
  const outputIds = runs.data.flatMap((run) =>
    run.output_document_id ? [run.output_document_id] : [],
  );
  const now = new Date();

  // Every read is under the caller's RLS, so a row they cannot see is not counted for them.
  const [links, outputs, modelCalls] = await Promise.all([
    context.supabase
      .from('dream_links')
      .select('dream_run_id, confirmed_at, dismissed_at')
      .in('dream_run_id', runIds),
    outputIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : context.supabase.from('documents').select('id, title').in('id', outputIds),
    loadDreamModelCalls(context, runs.data),
  ]);
  if (links.error) throw new Error(`Could not read dream links: ${links.error.message}`);
  if (outputs.error) throw new Error(`Could not read dream outputs: ${outputs.error.message}`);

  return {
    nights: buildNightlyDreams({
      runs: runs.data,
      spaces,
      links: links.data,
      outputs: outputs.data,
      modelCalls,
      readerId: context.userId,
      now,
    }),
    spaces,
  };
}

/** Spend is admin-only under model_calls_select_admin, so a member gets null rather than zeros. */
async function loadDreamModelCalls(
  context: SessionContext,
  runs: readonly DreamRunRecord[],
): Promise<readonly ModelCallRecord[] | null> {
  if (context.role === 'member') return null;

  const starts = runs.flatMap((run) => (run.started_at ? [run.started_at] : []));
  if (starts.length === 0) return [];
  const since = starts.reduce((earliest, start) => (start < earliest ? start : earliest));

  const { data, error } = await context.supabase
    .from('model_calls')
    .select('input_tokens, output_tokens, occurred_at')
    .in('purpose', [...DREAM_MODEL_PURPOSES])
    .gte('occurred_at', since)
    .limit(5000);
  if (error) throw new Error(`Could not read model calls: ${error.message}`);
  return data;
}

export type DreamSource = {
  readonly index: number;
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly excerpt: string;
};

export type DreamOutputView =
  | { readonly kind: 'none' }
  | { readonly kind: 'uncited'; readonly documentId: string; readonly title: string }
  | {
      readonly kind: 'sources-gone';
      readonly documentId: string;
      readonly title: string;
      readonly body: string;
      readonly citedCount: number;
    }
  | {
      readonly kind: 'cited';
      readonly documentId: string;
      readonly title: string;
      readonly body: string;
      readonly sources: readonly DreamSource[];
    };

export type DreamRunDetail = {
  readonly run: DreamRunSummary;
  readonly output: DreamOutputView;
  readonly candidates: readonly LinkCandidate[];
};

const EXCERPT_LENGTH = 240;

function excerpt(content: string): string {
  const stripped = content.replace(/\s+/g, ' ').trim();
  return stripped.length <= EXCERPT_LENGTH ? stripped : `${stripped.slice(0, EXCERPT_LENGTH)}...`;
}

/** Citations are resolved on read, through the caller's own RLS. */
async function loadOutput(
  context: SessionContext,
  outputDocumentId: string | null,
): Promise<DreamOutputView> {
  if (!outputDocumentId) return { kind: 'none' };

  const [{ data: document }, { data: bodyChunks }] = await Promise.all([
    context.supabase
      .from('documents')
      .select('id, title, source_chunk_ids')
      .eq('id', outputDocumentId)
      .maybeSingle(),
    context.supabase
      .from('chunks')
      .select('content, ordinal')
      .eq('document_id', outputDocumentId)
      .order('ordinal'),
  ]);

  if (!document) return { kind: 'none' };

  // Read separately under the caller's RLS, so a source they cannot see drops off the list.
  const { data: cited } = await context.supabase
    .from('chunks')
    .select('id, content, document_id, documents(title)')
    .in('id', document.source_chunk_ids);

  const visible = cited ?? [];
  const described = describeDreamOutput({
    documentId: document.id,
    title: document.title,
    sourceChunkIds: document.source_chunk_ids,
    visibleChunkIds: visible.map((chunk) => chunk.id),
  });

  const body = (bodyChunks ?? []).map((chunk) => chunk.content).join('\n\n');

  if (described.kind === 'none' || described.kind === 'uncited') return described;

  // The digest still shows when its sources are gone, with the citations dropped.
  if (described.kind === 'sources-gone') {
    return {
      kind: 'sources-gone',
      documentId: described.documentId,
      title: described.title,
      body,
      citedCount: described.citedCount,
    };
  }

  const byId = new Map(visible.map((chunk) => [chunk.id, chunk]));

  return {
    kind: 'cited',
    documentId: described.documentId,
    title: described.title,
    body,
    sources: described.chunkIds.flatMap((chunkId, index) => {
      const chunk = byId.get(chunkId);
      if (!chunk) return [];
      return [
        {
          index: index + 1,
          chunkId: chunk.id,
          documentId: chunk.document_id,
          documentTitle: chunk.documents?.title ?? 'Untitled',
          excerpt: excerpt(chunk.content),
        },
      ];
    }),
  };
}

async function loadCandidates(
  context: SessionContext,
  runId: string,
): Promise<readonly LinkCandidate[]> {
  const { data: links } = await context.supabase
    .from('dream_links')
    .select('id, document_a, document_b, similarity, rationale, confirmed_at, dismissed_at')
    .eq('dream_run_id', runId)
    .order('similarity', { ascending: false });

  if (!links || links.length === 0) return [];

  const documentIds = [...new Set(links.flatMap((link) => [link.document_a, link.document_b]))];
  const { data: documents } = await context.supabase
    .from('documents')
    .select('id, title, url, origin')
    .in('id', documentIds);

  return buildLinkCandidates({ links, documents: documents ?? [] });
}

export async function loadDreamRun(
  context: SessionContext,
  runId: string,
): Promise<DreamRunDetail | null> {
  const [{ data: run }, spaces] = await Promise.all([
    context.supabase.from('dream_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle(),
    fetchSpaces(context),
  ]);

  if (!run) return null;

  const [summary] = buildRunSummaries({ runs: [run], spaces });
  if (!summary) return null;

  const [output, candidates] = await Promise.all([
    loadOutput(context, run.output_document_id),
    run.kind === 'connections' ? loadCandidates(context, run.id) : Promise.resolve([]),
  ]);

  return { run: summary, output, candidates };
}

export type EntitiesPageData = {
  readonly groups: readonly EntityGroup[];
  readonly spaces: readonly SpaceRecord[];
};

export async function loadEntities(
  context: SessionContext,
  spaceId?: string,
): Promise<EntitiesPageData> {
  const spaces = await fetchSpaces(context);

  const entityQuery = context.supabase
    .from('entities')
    .select('id, kind, name, summary, space_id')
    .order('name')
    .limit(500);

  const { data: entities, error } = spaceId
    ? await entityQuery.eq('space_id', spaceId)
    : await entityQuery;
  if (error) throw new Error(`Could not read entities: ${error.message}`);
  if (entities.length === 0) return { groups: [], spaces };

  const { data: mentions } = await context.supabase
    .from('entity_mentions')
    .select('entity_id, document_id')
    .in(
      'entity_id',
      entities.map((entity) => entity.id),
    );

  const documentIds = [...new Set((mentions ?? []).map((mention) => mention.document_id))];
  const { data: documents } = await context.supabase
    .from('documents')
    .select('id, title, url')
    .in('id', documentIds);

  return {
    groups: buildEntityGroups({
      entities,
      mentions: mentions ?? [],
      documents: documents ?? [],
    }),
    spaces,
  };
}
