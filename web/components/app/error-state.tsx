export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div role="alert" className="flex flex-col gap-1 py-2">
      <h2 className="font-heading text-sm font-medium text-destructive-600">{title}</h2>
      {detail ? (
        <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">{detail}</p>
      ) : null}
    </div>
  );
}
