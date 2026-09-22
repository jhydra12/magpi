import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-[var(--measure-prose)]">
        <h1 className="font-heading text-xl leading-tight font-medium tracking-tight text-balance text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-tertiary-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
