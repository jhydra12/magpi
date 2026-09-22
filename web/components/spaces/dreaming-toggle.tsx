'use client';

import { useTransition } from 'react';

import { setDreaming } from '@/app/(app)/spaces/actions';
import { Switch } from '@/components/ui/switch';

/** The dreaming switch for one space, alongside a description of what dreaming does. */
export function DreamingToggle({ spaceId, enabled }: { spaceId: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    const formData = new FormData();
    formData.set('spaceId', spaceId);
    formData.set('enabled', String(next));
    // Awaited inside the transition, so isPending stays true until the write finishes.
    startTransition(async () => {
      await setDreaming(formData);
    });
  }

  return (
    <div className="flex items-start justify-between gap-6 py-2">
      <div className="max-w-[var(--measure-prose)]">
        <h2 className="font-heading text-sm font-medium text-foreground">Dreaming</h2>
        <p className="mt-1 text-sm text-tertiary-foreground">
          Once a night Magpi re-reads what came into this space that day, extracts the people and
          projects it mentions, links related documents, and writes a digest back into the space.
        </p>
      </div>

      <Switch
        checked={enabled}
        disabled={isPending}
        onCheckedChange={toggle}
        aria-label="Run dreaming on this space overnight"
      />
    </div>
  );
}
