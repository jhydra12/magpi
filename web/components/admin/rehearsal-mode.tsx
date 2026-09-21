'use client';

import { useState, useTransition } from 'react';

import { type RehearsalMode, setRehearsalMode } from '@/app/(app)/admin/demo/rehearsal-mode';
import { Switch } from '@/components/ui/switch';

export function RehearsalModeToggle({ initial }: { initial: RehearsalMode }) {
  const [mode, setMode] = useState(initial);
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const change = (next: boolean) => {
    // Moves with the thumb, and goes back if the server disagrees.
    setMode((current) => ({ ...current, enabled: next }));
    setFailure(null);
    startTransition(async () => {
      const result = await setRehearsalMode(next);
      if (result.status === 'success') setMode(result.data);
      else {
        setMode((current) => ({ ...current, enabled: !next }));
        setFailure(result.status === 'error' ? result.message : 'That could not be changed.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-6">
        <label htmlFor="rehearsal-mode" className="max-w-xl text-sm text-muted-foreground">
          Allows you to practice without running down OpenAI API tokens
        </label>
        <Switch
          id="rehearsal-mode"
          checked={mode.enabled}
          disabled={isPending || mode.isForcedByEnv}
          onCheckedChange={change}
          aria-label="Rehearsal mode"
        />
      </div>
      {mode.isForcedByEnv ? (
        <p className="text-xs text-tertiary-foreground">
          SB_MODEL_REHEARSAL is set on the server, so this cannot be changed here.
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
