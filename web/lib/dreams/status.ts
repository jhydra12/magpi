import type { Enums } from '@/lib/database.types';
import { asSentence } from '@/lib/text/sentence';
import type { StatusTone } from '@/lib/ui/status-tone';

export type DreamStatus = Enums<'dream_status'>;
export type DreamKind = Enums<'dream_kind'>;

/** The one sentence that defines the word, shown the first time it appears on any screen. */
export const DREAM_DEFINITION =
  'Dreaming is overnight processing: once a night, per space, Digital Brain re-reads what came in that day, extracts entities, links documents about the same thing, and writes a digest back into the space.';

/** The stages a dream job moves through, which the worker records as a prefix on `error`. */
export const DREAM_STAGES = ['collect', 'extract', 'embed', 'synthesize', 'write'] as const;

export type DreamStage = (typeof DREAM_STAGES)[number];

export type DreamFailure = {
  readonly stage: DreamStage | null;
  readonly message: string | null;
};

export function parseDreamFailure(error: string | null): DreamFailure {
  if (!error || error.trim() === '') return { stage: null, message: null };

  const separator = error.indexOf(':');
  if (separator === -1) return { stage: null, message: error };

  const candidate = error.slice(0, separator).trim().toLowerCase();
  const stage = DREAM_STAGES.find((known) => known === candidate);
  if (!stage) return { stage: null, message: error };

  return { stage, message: error.slice(separator + 1).trim() };
}

export type DreamStatusInput = {
  readonly status: DreamStatus;
  readonly error: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
};

export type DreamStatusView = {
  readonly status: DreamStatus;
  readonly label: string;
  readonly tone: StatusTone;
  readonly detail: string;
  readonly stage: DreamStage | null;
};

function failureDetail(failure: DreamFailure, verb: string): string {
  if (failure.stage && failure.message) {
    return `${verb} during ${failure.stage}. ${asSentence(failure.message)}`;
  }
  if (failure.stage) return `${verb} during ${failure.stage}.`;
  if (failure.message) return `${verb}. ${asSentence(failure.message)}`;
  return `${verb}. The stage it died in was not recorded.`;
}

export function describeDreamStatus(input: DreamStatusInput): DreamStatusView {
  const failure = parseDreamFailure(input.error);

  switch (input.status) {
    case 'queued':
      return {
        status: input.status,
        label: 'Queued',
        tone: 'neutral',
        detail: 'Waiting for a worker.',
        stage: null,
      };
    case 'running':
      return {
        status: input.status,
        label: 'Running',
        tone: 'progress',
        detail: 'Reading the space now.',
        stage: null,
      };
    case 'succeeded':
      return {
        status: input.status,
        label: 'Succeeded',
        tone: 'positive',
        detail: 'The run finished and wrote its output.',
        stage: null,
      };
    case 'failed':
      return {
        status: input.status,
        label: 'Failed',
        tone: 'destructive',
        detail: failureDetail(failure, 'Failed'),
        stage: failure.stage,
      };
    case 'timeout':
      return {
        status: input.status,
        label: 'Timed out',
        tone: 'warning',
        detail: failureDetail(failure, 'Timed out'),
        stage: failure.stage,
      };
    default: {
      const unhandled: never = input.status;
      throw new Error(`Unhandled dream status: ${String(unhandled)}`);
    }
  }
}

export type DreamKindDescription = {
  readonly kind: DreamKind;
  readonly label: string;
};

const KIND_DESCRIPTIONS: Record<DreamKind, DreamKindDescription> = {
  entities: { kind: 'entities', label: 'Entities' },
  digest: { kind: 'digest', label: 'Digest' },
  connections: { kind: 'connections', label: 'Document links' },
};

export function describeDreamKind(kind: DreamKind): DreamKindDescription {
  return KIND_DESCRIPTIONS[kind];
}

export const DREAM_KINDS: readonly DreamKind[] = ['entities', 'digest', 'connections'];

export function formatRunDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return 'Not started';
  if (!finishedAt) return 'Still running';

  const seconds = Math.max(
    0,
    Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
