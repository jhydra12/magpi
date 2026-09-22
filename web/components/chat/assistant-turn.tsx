import Link from 'next/link';

import { SourceMark } from '@/components/brand/source-mark';
import { splitAnswer } from '@/lib/chat/inline-citations';
import type { Citation } from '@/lib/chat/protocol';

/* ─────────────────────────────────────────────────────────
 * ANSWER MOTION
 *  waiting    "Reading your documents…" shimmers until the first token
 *  streaming  a caret blinks at the end of the latest text
 *  settled    the caret leaves with the stream
 * ───────────────────────────────────────────────────────── */

type AssistantTurnProps = {
  readonly content: string;
  readonly citations: readonly Citation[];
  readonly streaming: boolean;
};

export function AssistantTurn({ content, citations, streaming }: AssistantTurnProps) {
  const segments = splitAnswer(content, citations);
  const citedLabels = new Set(
    segments.flatMap((segment) => (segment.kind === 'citation' ? [segment.label] : [])),
  );
  const cited = citations.filter((_, index) => citedLabels.has(index + 1));

  if (segments.length === 0 && streaming) {
    return (
      <p className="shimmer text-sm text-tertiary-foreground shimmer-duration-1400">
        Reading your documents…
      </p>
    );
  }

  return (
    <div className="max-w-[var(--measure-prose)]">
      <p className="text-[15px] leading-7 whitespace-pre-wrap text-foreground">
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <span key={index}>{segment.text}</span>
          ) : (
            <Link
              key={index}
              href={`/documents/${segment.citation.documentId}`}
              title={segment.citation.documentTitle}
              className="mx-0.5 rounded-md bg-muted px-1.5 py-0.5 align-baseline text-xs font-medium text-brand-link hover:bg-secondary"
            >
              {segment.label}
            </Link>
          ),
        )}
        {streaming ? (
          <span
            aria-hidden
            className="magpi-caret ml-px inline-block h-[1.05em] w-px translate-y-0.5 bg-foreground"
          />
        ) : null}
      </p>

      {cited.length > 0 ? <Sources citations={cited} /> : null}
    </div>
  );
}

function Sources({ citations }: { citations: readonly Citation[] }) {
  return (
    <section className="mt-4">
      <h3 className="text-xs text-tertiary-foreground">Sources</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {citations.map((citation) => (
          <li key={citation.chunkId} className="max-w-full">
            <Link
              href={`/documents/${citation.documentId}`}
              title={citation.documentTitle}
              className="inline-flex max-w-56 items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-secondary motion-reduce:transition-none"
            >
              <SourceMark source={citation.documentSource} />
              <span className="min-w-0 truncate">{citation.documentTitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
