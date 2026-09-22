'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleState, type ActionState } from '@/lib/actions/state';
import type { InvitedMember } from '@/app/(app)/admin/members/actions';

export type InviteAction = (
  previous: ActionState<InvitedMember>,
  formData: FormData,
) => Promise<ActionState<InvitedMember>>;

/** The invitation link appears once, right after it is created. Only its hash is stored. */
export function InviteForm({ action, baseUrl }: { action: InviteAction; baseUrl: string }) {
  const [state, submit, pending] = useActionState<ActionState<InvitedMember>, FormData>(
    action,
    idleState,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="name@company.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="h-9 rounded-[var(--radius-panel)] border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? 'Inviting' : 'Send invitation'}
        </Button>
      </form>

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive-600">
          {state.message}
        </p>
      ) : null}

      {state.status === 'success' ? (
        <div className="rounded-[var(--radius-panel)] border border-border p-4">
          <p className="text-sm text-foreground">
            Invitation created for {state.data.email}. Send them this link.
          </p>
          <code className="mt-2 block font-mono text-xs break-all text-muted-foreground">
            {`${baseUrl}/invite/${state.data.token}`}
          </code>
          <p className="mt-2 text-xs text-tertiary-foreground">
            This is the only time the link is shown. Digital Brain stores a hash of it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
