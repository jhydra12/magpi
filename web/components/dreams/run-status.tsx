import type { DreamStatusView } from '@/lib/dreams/status';
import type { StatusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-brand-600',
  progress: 'text-muted-foreground',
  warning: 'text-warning-600',
  destructive: 'text-destructive-600',
};

/** A run's status as one word, and nothing at all for the ordinary case of a finished run. */
export function RunStatus({ status, className }: { status: DreamStatusView; className?: string }) {
  if (status.status === 'succeeded') return null;

  return (
    <span className={cn('text-xs font-medium', TONE_TEXT[status.tone], className)}>
      {status.label}
    </span>
  );
}
