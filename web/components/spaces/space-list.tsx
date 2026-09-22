import Link from 'next/link';

import { describeKind, type Space } from '@/lib/spaces/spaces';

/** A list of spaces, each with its kind, document count and member count. */
export function SpaceList({ spaces }: { spaces: readonly Space[] }) {
  return (
    <ul className="divide-y divide-border">
      {spaces.map((space) => (
        <li
          key={space.id}
          className="-mx-2 flex items-baseline justify-between gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted motion-reduce:transition-none"
        >
          <div className="min-w-0">
            <Link href={`/spaces/${space.id}`} className="text-sm font-medium text-foreground">
              {space.name}
            </Link>
            <p className="mt-0.5 text-xs text-tertiary-foreground">{describeKind(space.kind)}</p>
          </div>

          <dl className="flex shrink-0 gap-6 text-xs text-tertiary-foreground">
            <div className="text-right">
              <dt className="sr-only">Documents</dt>
              <dd className="text-foreground tabular-nums">{space.documentCount}</dd>
              <dd>documents</dd>
            </div>
            <div className="text-right">
              <dt className="sr-only">Members</dt>
              <dd className="text-foreground tabular-nums">{space.memberCount}</dd>
              <dd>{space.memberCount === 1 ? 'member' : 'members'}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
