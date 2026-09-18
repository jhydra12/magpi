import type { Tables } from '@/lib/database.types';
import type { StatusTone } from '@/lib/ui/status-tone';

import {
  describeDreamKind,
  describeDreamStatus,
  type DreamKind,
  type DreamStatusView,
} from './status';
import type { DreamRunRecord, SpaceRecord } from './view-model';

export type DreamLinkCountRecord = Pick<Tables<'dream_links'>, 'dream_run_id'>;

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
  readonly night: string;
  readonly nightLabel: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly durationLabel: string;
  readonly documentsIngested: number;
  readonly connectionsMade: number;
  readonly runs: readonly NightlyDreamRun[];
  readonly status: NightlyDreamStatus;
};

const NIGHT_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Runs are bucketed by the UTC day they were queued, the same clock the nightly schedule keeps. */
function nightOf(createdAt: string): string {
  return createdAt.slice(0, 10);
}

function formatNight(night: string): string {
  return NIGHT_LABEL.format(new Date(`${night}T00:00:00.000Z`));
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

/**
 * Rolls the run rows up into one entry per space per night. A run whose space is not in the
 * reader's list is dropped, the same as the per-run summary does, because the reader cannot
 * open it anyway.
 */
export function buildNightlyDreams({
  runs,
  spaces,
  links,
}: {
  readonly runs: readonly DreamRunRecord[];
  readonly spaces: readonly SpaceRecord[];
  readonly links: readonly DreamLinkCountRecord[];
}): readonly NightlyDream[] {
  const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));

  const linksPerRun = new Map<string, number>();
  for (const link of links) {
    linksPerRun.set(link.dream_run_id, (linksPerRun.get(link.dream_run_id) ?? 0) + 1);
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

      return {
        id,
        night,
        nightLabel: formatNight(night),
        spaceId: first.space_id,
        spaceName: spaceNames.get(first.space_id) ?? '',
        durationLabel: describeDuration(ordered),
        // Every pass reads the same day's arrivals, so the largest count is the day's count.
        documentsIngested: Math.max(...ordered.map((run) => run.input_document_count)),
        connectionsMade: ordered.reduce((total, run) => total + (linksPerRun.get(run.id) ?? 0), 0),
        runs: passes,
        status: describeNight(passes),
      };
    })
    .sort((a, b) => b.night.localeCompare(a.night) || a.spaceName.localeCompare(b.spaceName));
}
