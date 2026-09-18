import type { Tables } from '@/lib/database.types';
import type { StatusTone } from '@/lib/ui/status-tone';

import {
  describeDreamKind,
  describeDreamStatus,
  type DreamKind,
  type DreamStatusView,
} from './status';
import type { DreamRunRecord, SpaceRecord } from './view-model';

export type DreamLinkRecord = Pick<
  Tables<'dream_links'>,
  'dream_run_id' | 'confirmed_at' | 'dismissed_at'
>;

export type DreamOutputRecord = Pick<Tables<'documents'>, 'id' | 'title'>;

export type ModelCallRecord = Pick<
  Tables<'model_calls'>,
  'input_tokens' | 'output_tokens' | 'occurred_at'
>;

/** The model purposes a dream pass spends on. Embeddings are shared with ingestion and left out. */
export const DREAM_MODEL_PURPOSES: readonly string[] = ['dream', 'extract'];

/** One pass inside a night's dream, kept so the log can still open the run's own page. */
export type NightlyDreamRun = {
  readonly id: string;
  readonly kind: DreamKind;
  readonly kindLabel: string;
  readonly status: DreamStatusView;
};

/** What the log says about a night as a whole: the ordinary case, or the pass that went wrong. */
export type NightlyDreamStatus = {
  readonly label: string;
  readonly tone: StatusTone;
  readonly detail: string | null;
};

/**
 * Everything Magpi did for one space in one night: the entity pass, the digest and the
 * document links, rolled up into the numbers a person asks about the morning after.
 */
export type NightlyDream = {
  readonly id: string;
  /** The UTC date the night was queued, for ordering. The label is what a person sees. */
  readonly night: string;
  readonly nightLabel: string;
  readonly spaceId: string;
  readonly spaceName: string;
  /** "Nightly" for the schedule, "You" for the reader, "A member" for anyone else. */
  readonly startedBy: string;
  readonly durationLabel: string;
  readonly documentsIngested: number;
  readonly connectionsFound: number;
  readonly connectionsConfirmed: number;
  /** Prompt and completion tokens the night's model calls spent, or null when the reader cannot see them. */
  readonly modelTokens: number | null;
  readonly output: DreamOutputRecord | null;
  readonly runs: readonly NightlyDreamRun[];
  readonly status: NightlyDreamStatus;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Runs are bucketed by the UTC day they were queued, the same clock the nightly schedule keeps. */
function nightOf(createdAt: string): string {
  return createdAt.slice(0, 10);
}

/** How a person counts nights, not a calendar date: the log is about the morning after. */
export function formatNight(night: string, now: Date): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nightsAgo = Math.round((today - Date.parse(`${night}T00:00:00.000Z`)) / DAY_MS);
  if (nightsAgo <= 0) return 'Tonight';
  if (nightsAgo === 1) return 'Last night';
  return `${nightsAgo} nights ago`;
}

function elapsedSeconds(run: DreamRunRecord): number {
  if (!run.started_at || !run.finished_at) return 0;
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return Math.max(0, Math.round(ms / 1000));
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** The night's clock: the sum of every finished pass, or a word when a pass has not finished. */
function describeDuration(runs: readonly DreamRunRecord[]): string {
  if (runs.some((run) => run.status === 'running')) return 'Still running';
  if (runs.every((run) => !run.started_at)) return 'Not started';
  return formatSeconds(runs.reduce((total, run) => total + elapsedSeconds(run), 0));
}

function describeStarter(runs: readonly DreamRunRecord[], readerId: string): string {
  const people = runs.map((run) => run.triggered_by).filter((id) => id !== null);
  if (people.length === 0) return 'Nightly';
  if (people.some((id) => id === readerId)) return 'You';
  return 'A member';
}

/**
 * A call belongs to a night when it happened while one of the night's passes was running. Model
 * calls carry no run id, so two spaces dreaming at the same minute share the same calls; the
 * worker drains one space at a time, which keeps that rare.
 */
function tokensSpent(
  runs: readonly DreamRunRecord[],
  calls: readonly ModelCallRecord[],
  now: Date,
): number {
  const windows = runs.flatMap((run) => {
    if (!run.started_at) return [];
    const start = new Date(run.started_at).getTime();
    const end = run.finished_at ? new Date(run.finished_at).getTime() : now.getTime();
    return [{ start, end }];
  });

  return calls.reduce((total, call) => {
    const at = new Date(call.occurred_at).getTime();
    const inside = windows.some((window) => at >= window.start && at <= window.end);
    return inside ? total + call.input_tokens + call.output_tokens : total;
  }, 0);
}

const RUNNING: NightlyDreamStatus = {
  label: 'Running',
  tone: 'progress',
  detail: 'Reading the space now.',
};
const QUEUED: NightlyDreamStatus = { label: 'Queued', tone: 'neutral', detail: null };
const DONE: NightlyDreamStatus = { label: 'Done', tone: 'positive', detail: null };

/** A night is ordinary unless a pass is still going or one of them died. */
function describeNight(runs: readonly NightlyDreamRun[]): NightlyDreamStatus {
  if (runs.some((run) => run.status.status === 'running')) return RUNNING;

  const broken = runs.find(
    (run) => run.status.status === 'failed' || run.status.status === 'timeout',
  );
  if (broken) {
    return {
      label: `${broken.kindLabel} ${broken.status.label.toLowerCase()}`,
      tone: broken.status.tone,
      detail: broken.status.detail,
    };
  }

  if (runs.some((run) => run.status.status === 'queued')) return QUEUED;
  return DONE;
}

const KIND_ORDER: readonly DreamKind[] = ['entities', 'digest', 'connections'];

function byKind(a: DreamRunRecord, b: DreamRunRecord): number {
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
}

export type NightlyDreamInputs = {
  readonly runs: readonly DreamRunRecord[];
  readonly spaces: readonly SpaceRecord[];
  readonly links: readonly DreamLinkRecord[];
  readonly outputs: readonly DreamOutputRecord[];
  /** Null when the reader is not an organization admin, who is the only one allowed to see spend. */
  readonly modelCalls: readonly ModelCallRecord[] | null;
  readonly readerId: string;
  readonly now: Date;
};

/**
 * Rolls the run rows up into one entry per space per night. A run whose space is not in the
 * reader's list is dropped, the same as the per-run summary does, because the reader cannot
 * open it anyway.
 */
export function buildNightlyDreams({
  runs,
  spaces,
  links,
  outputs,
  modelCalls,
  readerId,
  now,
}: NightlyDreamInputs): readonly NightlyDream[] {
  const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));
  const outputsById = new Map(outputs.map((output) => [output.id, output]));

  const linksPerRun = new Map<string, DreamLinkRecord[]>();
  for (const link of links) {
    linksPerRun.set(link.dream_run_id, [...(linksPerRun.get(link.dream_run_id) ?? []), link]);
  }

  const nights = new Map<string, DreamRunRecord[]>();
  for (const run of runs) {
    if (!spaceNames.has(run.space_id)) continue;
    const key = `${run.space_id}|${nightOf(run.created_at)}`;
    nights.set(key, [...(nights.get(key) ?? []), run]);
  }

  return [...nights.entries()]
    .map(([id, group]) => {
      const ordered = [...group].sort(byKind);
      const first = ordered[0];
      const night = nightOf(first.created_at);
      const passes = ordered.map((run) => ({
        id: run.id,
        kind: run.kind,
        kindLabel: describeDreamKind(run.kind).label,
        status: describeDreamStatus({
          status: run.status,
          error: run.error,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
        }),
      }));
      const nightLinks = ordered.flatMap((run) => linksPerRun.get(run.id) ?? []);
      // The digest is the pass that writes a document; the others write rows.
      const written = ordered
        .map((run) => (run.output_document_id ? outputsById.get(run.output_document_id) : null))
        .find((output) => output !== null && output !== undefined);

      return {
        id,
        night,
        nightLabel: formatNight(night, now),
        spaceId: first.space_id,
        spaceName: spaceNames.get(first.space_id) ?? '',
        startedBy: describeStarter(ordered, readerId),
        durationLabel: describeDuration(ordered),
        // Every pass reads the same day's arrivals, so the largest count is the day's count.
        documentsIngested: Math.max(...ordered.map((run) => run.input_document_count)),
        connectionsFound: nightLinks.length,
        connectionsConfirmed: nightLinks.filter((link) => link.confirmed_at !== null).length,
        modelTokens: modelCalls === null ? null : tokensSpent(ordered, modelCalls, now),
        output: written ?? null,
        runs: passes,
        status: describeNight(passes),
      };
    })
    .sort((a, b) => b.night.localeCompare(a.night) || a.spaceName.localeCompare(b.spaceName));
}

/** Tokens as a person reads them on a row: 850, 12k, 1.2M. */
export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}
