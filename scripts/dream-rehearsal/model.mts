import { z } from 'zod';

const uuid = z.uuid();
const httpUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/'
  );
}, 'Use an HTTP(S) origin without credentials, paths, or query parameters');

export const manifestSchema = z
  .object({
    version: z.literal(1),
    batchId: uuid,
    createdAt: z.iso.datetime(),
    targetUrl: httpUrl,
    webUrl: httpUrl,
    sourceSpaceId: uuid,
    orgId: uuid,
    userId: uuid,
    spaces: z
      .array(
        z.object({
          id: uuid,
          runId: uuid,
          documents: z
            .array(
              z.object({
                id: uuid,
                sourceId: uuid,
                chunks: z.array(z.object({ id: uuid, sourceId: uuid })).min(1),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((manifest, context) => {
    const ids = manifest.spaces.flatMap((space) => [
      space.id,
      space.runId,
      ...space.documents.flatMap((document) => [
        document.id,
        ...document.chunks.map((chunk) => chunk.id),
      ]),
    ]);
    if (new Set(ids).size !== ids.length || ids.includes(manifest.sourceSpaceId)) {
      context.addIssue({
        code: 'custom',
        message: 'Owned IDs must be unique and exclude the source space',
      });
    }
  });

export type Manifest = z.infer<typeof manifestSchema>;

/** Validates CLI flags before connecting to a database. */
export function options(args: string[]): {
  command: 'prepare' | 'status' | 'cleanup';
  manifest: string;
  sourceSpace?: string;
  user?: string;
  count: number;
} {
  const command = z.enum(['prepare', 'status', 'cleanup']).parse(args[0]);
  const flags = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (
      !['--manifest', '--source-space', '--user', '--count'].includes(flag) ||
      !value ||
      value.startsWith('--') ||
      flags.has(flag)
    ) {
      throw new Error(
        'Expected unique --manifest, --source-space, --user, and --count flag/value pairs',
      );
    }
    flags.set(flag, value);
  }
  const manifest = z.string().min(1).parse(flags.get('--manifest'));
  if (command !== 'prepare' && [...flags.keys()].some((flag) => flag !== '--manifest')) {
    throw new Error('status and cleanup accept only --manifest');
  }
  return {
    command,
    manifest,
    sourceSpace: command === 'prepare' ? uuid.parse(flags.get('--source-space')) : undefined,
    user: command === 'prepare' ? uuid.parse(flags.get('--user')) : undefined,
    count: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(flags.get('--count') ?? 24),
  };
}

/** Validates explicit database and app origins; never infers a hosted target. */
export function targetUrl(value: string | undefined): string {
  return new URL(httpUrl.parse(value)).origin;
}

/** Links directly to the exact runs owned by this rehearsal. */
export function batchUrl(manifest: Manifest): string {
  return `${manifest.webUrl}/dreams?runs=${manifest.spaces.map((space) => space.runId).join(',')}`;
}

/** Produces the exact identifying name checked before deleting a rehearsal space. */
export function spaceName(manifest: Manifest, index: number): string {
  return `Dream rehearsal ${manifest.batchId} ${index + 1}`;
}

/** Rejects cleanup outside the manifest target and its explicitly owned spaces. */
export function verifyOwnership(
  manifest: Manifest,
  url: string,
  spaces: { id: string; name: string; org_id: string; kind: string; description: string | null }[],
): void {
  if (targetUrl(url) !== manifest.targetUrl)
    throw new Error('Manifest target differs from the current database URL');
  for (const space of spaces) {
    const index = manifest.spaces.findIndex((owned) => owned.id === space.id);
    if (
      index < 0 ||
      space.org_id !== manifest.orgId ||
      space.kind !== 'team' ||
      space.name !== spaceName(manifest, index) ||
      space.description !== `Dream rehearsal batch ${manifest.batchId}`
    ) {
      throw new Error('Space ownership check failed; refusing cleanup');
    }
  }
}

export interface RunStatus {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  output_document_id: string | null;
  input_document_count: number;
}

export interface BatchSummary {
  requested: number;
  missing: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  timeout: number;
  nonemptyOutputs: number;
  elapsedSeconds: number;
  completedPerMinute: number;
  isFinished: boolean;
  runs: { id: string; status: string; inputDocuments: number; outputDocumentId: string | null }[];
}

/** Measures only requested runs, from actual queue creation through the final completion. */
export function summarize(
  manifest: Manifest,
  runs: RunStatus[],
  nonemptyOutputIds: Set<string>,
  now = Date.now(),
): BatchSummary {
  const requested = new Set(manifest.spaces.map((space) => space.runId));
  const selected = runs.filter((run) => requested.has(run.id));
  const count = (status: string): number => selected.filter((run) => run.status === status).length;
  const terminal = selected.filter((run) =>
    ['succeeded', 'failed', 'timeout'].includes(run.status),
  );
  const isFinished = selected.length === requested.size && terminal.length === selected.length;
  const start = selected.length
    ? Math.min(...selected.map((run) => Date.parse(run.created_at)))
    : now;
  const end = isFinished
    ? Math.max(...terminal.map((run) => Date.parse(run.finished_at ?? run.created_at)))
    : now;
  const seconds = Math.max(0, (end - start) / 1000);
  return {
    requested: requested.size,
    missing: requested.size - selected.length,
    queued: count('queued'),
    running: count('running'),
    completed: count('succeeded'),
    failed: count('failed'),
    timeout: count('timeout'),
    nonemptyOutputs: selected.filter(
      (run) =>
        run.status === 'succeeded' &&
        run.output_document_id &&
        nonemptyOutputIds.has(run.output_document_id),
    ).length,
    elapsedSeconds: Number(seconds.toFixed(2)),
    completedPerMinute: seconds > 0 ? Number(((count('succeeded') * 60) / seconds).toFixed(2)) : 0,
    isFinished,
    runs: selected.map((run) => ({
      id: run.id,
      status: run.status,
      inputDocuments: run.input_document_count,
      outputDocumentId: run.output_document_id,
    })),
  };
}
