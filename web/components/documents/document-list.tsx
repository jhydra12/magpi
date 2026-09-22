import Link from 'next/link';

import { SourceMark } from '@/components/brand/source-mark';
import { describeIngest, describeOrigin, type DocumentSummary } from '@/lib/documents/documents';

export function DocumentList({ documents }: { documents: readonly DocumentSummary[] }) {
  return (
    <ul className="divide-y divide-border">
      {documents.map((document) => {
        const problem = describeIngest(document.ingest);
        const isFailure =
          document.ingest?.status === 'failed' || document.ingest?.status === 'timeout';

        return (
          <li
            key={document.id}
            className="-mx-2 flex flex-col gap-1 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted motion-reduce:transition-none"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <SourceMark source={document.provider ?? document.url ?? document.origin} title />
                <Link
                  href={`/documents/${document.id}`}
                  className="truncate text-sm font-medium text-foreground"
                >
                  {document.title}
                </Link>
              </div>
              <time
                className="shrink-0 text-xs text-tertiary-foreground"
                dateTime={document.updatedAt}
              >
                {document.updatedAt.slice(0, 10)}
              </time>
            </div>

            <p className="text-xs text-tertiary-foreground">
              {describeOrigin(document.origin)} into {document.spaceName}
              {problem ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className={isFailure ? 'text-destructive-600' : undefined}>{problem}</span>
                </>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
