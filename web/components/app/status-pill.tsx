import type { StatusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  positive: 'border-border-brand bg-brand-200 text-brand-600',
  progress: 'border-input bg-muted text-muted-foreground',
  warning: 'border-border-warning bg-warning-200 text-warning-600',
  destructive: 'border-border-destructive bg-destructive-200 text-destructive-600',
};

/** Status as a border and a background tint. Shared by connections and dreams. */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
      )}
    >
      {label}
    </span>
  );
}
