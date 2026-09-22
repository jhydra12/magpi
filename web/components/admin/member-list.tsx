import { EmptyState } from '@/components/app/empty-state';
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
import { StatusBadge, type StatusTone } from './status-badge';

type OrgRole = Database['public']['Enums']['org_role'];

export type MemberRow = {
  readonly userId: string;
  readonly email: string;
  readonly role: OrgRole;
  readonly joinedAt: string;
  readonly isSelf: boolean;
};

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const ROLE_TONE: Record<OrgRole, StatusTone> = {
  owner: 'positive',
  admin: 'neutral',
  member: 'neutral',
};

export function MemberList({
  members,
  now,
  removeAction,
}: {
  members: readonly MemberRow[];
  now: Date;
  removeAction: FormAction;
}) {
  if (members.length === 0) {
    return (
      <EmptyState
        title="No members yet"
        description="Members appear here once they accept an invitation."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Remove</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.userId}>
            <TableCell className="text-foreground">{member.email}</TableCell>
            <TableCell>
              <StatusBadge tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</StatusBadge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatSince(member.joinedAt, now)}
            </TableCell>
            <TableCell className="text-right">
              {member.isSelf || member.role === 'owner' ? (
                <span className="text-xs text-tertiary-foreground">
                  {member.isSelf ? 'That is you' : 'Owner'}
                </span>
              ) : (
                <ActionButton
                  action={removeAction}
                  fieldName="userId"
                  fieldValue={member.userId}
                  label="Remove"
                  pendingLabel="Removing…"
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
