import type { ReactNode } from 'react';

/** The day-one screen for an empty knowledge base. It always names the next action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-16">
      <h2 className="font-heading text-base font-medium text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-[var(--measure-prose)] text-sm leading-relaxed text-tertiary-foreground">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
