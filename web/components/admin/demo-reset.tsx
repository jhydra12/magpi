'use client';

import { Check, Circle, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { resetDemoStep } from '@/app/(app)/admin/demo/actions';
import { Button } from '@/components/ui/button';

const STEPS = [
  { id: 'pause', label: 'Stop Dream processing' },
  { id: 'chats', label: 'Delete chat history' },
  { id: 'compute', label: 'Delete all Compute services' },
  { id: 'data', label: 'Delete generated Dream data' },
  { id: 'freshen', label: 'Refresh source document timestamps' },
  { id: 'edge', label: 'Restore Edge Functions' },
] as const;
type Step = (typeof STEPS)[number]['id'];
type Status = 'pending' | 'running' | 'complete' | 'failed';
const initialStatuses: Record<Step, Status> = {
  pause: 'pending',
  chats: 'pending',
  compute: 'pending',
  data: 'pending',
  freshen: 'pending',
  edge: 'pending',
};
const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
};

export function DemoReset() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [failure, setFailure] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  async function reset() {
    if (busy.current) return;
    if (
      !window.confirm(
        'Reset the demo, delete every Compute service, and delete all generated Dream output?',
      )
    )
      return;
    busy.current = true;
    setPending(true);
    setStatuses(initialStatuses);
    setFailure(null);
    setShowToast(false);
    try {
      for (const step of STEPS) {
        setStatuses((current) => ({ ...current, [step.id]: 'running' }));
        try {
          const deadline = Date.now() + 10 * 60_000;
          while (true) {
            const result = await resetDemoStep(step.id);
            if (result.status === 'error') throw new Error(result.message);
            if (result.status !== 'success') throw new Error('The reset could not be completed.');
            if (result.data.complete) break;
            if (Date.now() >= deadline) {
              throw new Error('This step is still waiting. Try Reset again.');
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
          setStatuses((current) => ({ ...current, [step.id]: 'complete' }));
        } catch (error) {
          setStatuses((current) => ({ ...current, [step.id]: 'failed' }));
          setFailure(error instanceof Error ? error.message : 'The reset could not be completed.');
          return;
        }
      }
      setShowToast(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <ol
        aria-label="Demo reset progress"
        aria-live="polite"
        className="flex flex-col gap-3 text-sm"
      >
        {STEPS.map((step) => {
          const status = statuses[step.id];
          const Icon =
            status === 'complete'
              ? Check
              : status === 'failed'
                ? X
                : status === 'running'
                  ? Loader2
                  : Circle;
          return (
            <li key={step.id} className="flex items-center gap-3">
              <Icon
                aria-hidden="true"
                className={`size-4 ${status === 'complete' ? 'text-brand-600' : status === 'failed' ? 'text-destructive-600' : 'text-muted-foreground'} ${status === 'running' ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
              <span>{step.label}</span>
              <span className="sr-only">{STATUS_LABELS[status]}</span>
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="destructive"
        className="bg-destructive-600 text-white hover:bg-destructive-600/90"
        disabled={pending}
        onClick={() => void reset()}
      >
        {pending ? 'Resetting…' : 'Reset'}
      </Button>
      {failure ? (
        <p role="alert" className="text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}
      {showToast ? (
        <div
          role="status"
          className="fixed right-6 bottom-6 z-50 flex items-center gap-4 rounded-panel border border-border bg-background px-5 py-4 text-sm text-foreground shadow-lg"
        >
          <span>Demo is reset. Good luck!</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dismiss notification"
            onClick={() => setShowToast(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
