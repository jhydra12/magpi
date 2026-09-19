import type { Database } from '@/lib/database.types';

type SpaceKind = Database['public']['Enums']['space_kind'];

export type SpaceMember = { readonly userId: string; readonly joinedAt: string };

export function SpaceMembers({
  kind,
  members,
}: {
  kind: SpaceKind;
  members: readonly SpaceMember[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium text-foreground">
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </h2>

      {kind === 'personal' ? (
        <p className="text-sm text-tertiary-foreground">
          A personal space has one member, always. Nobody can be added to it.
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm text-muted-foreground"
          >
            <span className="font-mono text-xs">{member.userId.slice(0, 8)}</span>
            <time className="text-xs text-tertiary-foreground" dateTime={member.joinedAt}>
              joined {member.joinedAt.slice(0, 10)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
