import Link from 'next/link';

import type { EntityGroup } from '@/lib/dreams/entities';

/** What the entity dream extracted, each with the documents it was mentioned in. */
export function EntityGroups({ groups }: { groups: readonly EntityGroup[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.kind} className="flex flex-col gap-3">
          <h2 className="font-heading text-sm font-medium text-foreground">{group.label}</h2>

          <ul className="divide-y divide-border">
            {group.entities.map((entity) => (
              <li key={entity.id} aria-label={entity.name} className="py-3">
                <p className="text-sm font-medium text-foreground">{entity.name}</p>
                {entity.summary ? (
                  <p className="mt-0.5 max-w-[var(--measure-prose)] text-sm text-muted-foreground">
                    {entity.summary}
                  </p>
                ) : null}

                {entity.documents.length === 0 ? (
                  <p className="mt-1 text-xs text-tertiary-foreground">
                    No documents you can see mention this.
                  </p>
                ) : (
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {entity.documents.map((document) => (
                      <li key={document.id}>
                        <Link
                          href={`/documents/${document.id}`}
                          className="text-xs text-brand-link hover:underline"
                        >
                          {document.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
