import { isDreamActive, type DreamActivityRun } from './activity';

const TASK_LABELS = {
  entities: 'Finding entities',
  digest: 'Writing summary',
  connections: 'Finding related documents',
};

/** The bulk submission shares a timestamp; summarize its jobs for one space row. */
export function summarizeSpaceDream(runs: readonly DreamActivityRun[]) {
  const ordered = [...runs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const selected = ordered.find(isDreamActive) ?? ordered[0];
  if (!selected) return undefined;
  const candidates = ordered.filter((run) => run.created_at === selected.created_at);
  const tasks =
    new Set(candidates.map((run) => run.kind)).size === candidates.length ? candidates : [selected];
  const representative = tasks.find((run) => run.kind === 'digest') ?? selected;
  const running = tasks.filter((run) => run.status === 'running');
  const active = tasks.some(isDreamActive);
  const failed = tasks.filter((run) => run.status === 'failed' || run.status === 'timeout');
  const completed = tasks.filter((run) => run.status === 'succeeded').length;
  const starts = tasks.flatMap((run) => (run.started_at ? [run.started_at] : [])).sort();
  const finishes = tasks.flatMap((run) => (run.finished_at ? [run.finished_at] : [])).sort();
  const status = running.length
    ? 'running'
    : active
      ? 'queued'
      : (failed[0]?.status ?? 'succeeded');
  const run: DreamActivityRun = {
    ...representative,
    status,
    started_at: starts[0] ?? null,
    finished_at: active ? null : (finishes.at(-1) ?? null),
    error: failed[0]?.error ?? null,
  };
  const currentTask =
    running.length === 1
      ? TASK_LABELS[running[0].kind]
      : running.length > 1
        ? `${running.length} tasks running`
        : active
          ? 'Queued'
          : 'Completed';
  const label =
    failed.length && !active
      ? `${completed} of ${tasks.length} tasks completed · ${failed.length} failed`
      : `${completed} of ${tasks.length} tasks completed · ${currentTask}`;
  // The digest is worth opening whenever it wrote something, even if a sibling task failed.
  const digest = tasks.find(
    (task) =>
      task.kind === 'digest' && task.status === 'succeeded' && Boolean(task.output_document_id),
  );
  return {
    run,
    completed,
    total: tasks.length,
    label,
    failed,
    digestRunId: digest?.id ?? null,
  };
}
