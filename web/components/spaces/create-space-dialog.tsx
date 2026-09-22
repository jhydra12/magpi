'use client';

import { useActionState, useState } from 'react';

import { createTeamSpace } from '@/app/(app)/spaces/actions';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleState, type ActionState } from '@/lib/actions/state';

async function submit(_previous: ActionState<{ id: string }>, formData: FormData) {
  return createTeamSpace(formData);
}

export function CreateSpaceDialog() {
  const [open, setOpen] = useState(false);
  // Controlled, because React resets an uncontrolled form once its action settles. Uncontrolled
  // fields would empty on a refusal and take what somebody typed with them.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Closing here rather than in an effect watching the result, which lints as a cascading render.
  // The space exists once the action succeeds, so the dialog has nothing left to show.
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionState<{ id: string }>, formData: FormData) => {
      const next = await submit(previous, formData);
      if (next.status === 'success') {
        setName('');
        setDescription('');
        setOpen(false);
      }
      return next;
    },
    idleState,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create</Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New team space</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <FormError message={state.status === 'error' ? state.message : null} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="space-name">Name your space</Label>
            <Input
              id="space-name"
              name="name"
              placeholder="Growth"
              required
              maxLength={120}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="space-description">Give it a description</Label>
            <Textarea
              id="space-description"
              name="description"
              placeholder="What belongs in here, and what does not."
              maxLength={400}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
