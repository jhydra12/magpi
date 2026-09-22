'use client';

import { useActionState } from 'react';

import { updateSpaceDetails } from '@/app/(app)/spaces/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleState, type ActionState } from '@/lib/actions/state';

/** What a space is called and what it is for, editable by anyone who is in it. */
export function SpaceDetailsForm({
  spaceId,
  name,
  description,
}: {
  spaceId: string;
  name: string;
  description: string | null;
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    updateSpaceDetails,
    idleState,
  );

  return (
    <form action={submit} className="flex max-w-[var(--measure-prose)] flex-col gap-4">
      <input type="hidden" name="spaceId" value={spaceId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="space-name">Name</Label>
        <Input id="space-name" name="name" defaultValue={name} required maxLength={120} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="space-description">Description</Label>
        <Textarea
          id="space-description"
          name="description"
          defaultValue={description ?? ''}
          maxLength={400}
          rows={2}
          placeholder="What belongs in here, so the next person knows where to put things."
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>

        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive-600">
            {state.message}
          </p>
        ) : null}
        {state.status === 'success' ? (
          <p className="text-sm text-tertiary-foreground">Saved</p>
        ) : null}
      </div>
    </form>
  );
}
