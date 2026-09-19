'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { idleState } from '@/lib/actions/state';
import type { ActionState } from '@/lib/actions/state';
import { resetDemo } from '@/app/(app)/admin/demo/actions';

export function DemoReset() {
  const [state, submit, pending] = useActionState<ActionState<{ deleted: number }>, FormData>(
    resetDemo,
    idleState,
  );

  function confirmReset(event: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm('Reset the demo and delete all generated Dream output?')) {
      event.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={submit} onSubmit={confirmReset}>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? 'Resetting…' : 'Reset'}
        </Button>
      </form>
      {state.status === 'success' ? (
        <p className="text-sm text-foreground">Demo reset. Generated Dream output was deleted.</p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive-600">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
