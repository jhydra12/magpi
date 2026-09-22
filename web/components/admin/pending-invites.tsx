import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSince } from '@/lib/analytics/format';
import type { Database } from '@/lib/database.types';

import { ActionButton, type FormAction } from './action-button';

type OrgRole = Database['public']['Enums']['org_role'];

export type InviteRow = {
  readonly id: string;
  readonly email: string;
  readonly role: OrgRole;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export function PendingInvites({
  invites,
  now,
  revokeAction,
}: {
  invites: readonly InviteRow[];
  now: Date;
  revokeAction: FormAction;
}) {
  if (invites.length === 0) {
    return <p className="text-sm text-tertiary-foreground">No invitations are waiting.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invited</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="text-right">Revoke</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invites.map((invite) => (
          <TableRow key={invite.id}>
            <TableCell className="text-foreground">{invite.email}</TableCell>
            <TableCell className="text-muted-foreground capitalize">{invite.role}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatSince(invite.createdAt, now)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(invite.expiresAt) < now
                ? 'Expired'
                : `in ${Math.ceil((new Date(invite.expiresAt).getTime() - now.getTime()) / 86_400_000)} days`}
            </TableCell>
            <TableCell className="text-right">
              <ActionButton
                action={revokeAction}
                fieldName="inviteId"
                fieldValue={invite.id}
                label="Revoke"
                pendingLabel="Revoking…"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
