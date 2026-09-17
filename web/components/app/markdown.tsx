import ReactMarkdown, { type Components } from 'react-markdown';

import { cn } from '@/lib/utils';

/** Every element on the semantic tokens, sized for text that sits under a page heading. */
const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className="mt-2 font-heading text-base font-medium text-foreground">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-2 font-heading text-base font-medium text-foreground">{children}</h3>
  ),
  h3: ({ children }) => <h4 className="mt-1 text-sm font-medium text-foreground">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-1 text-sm font-medium text-foreground">{children}</h4>,
  h5: ({ children }) => <h4 className="mt-1 text-sm font-medium text-foreground">{children}</h4>,
  h6: ({ children }) => <h4 className="mt-1 text-sm font-medium text-foreground">{children}</h4>,
  p: ({ children }) => <p className="text-sm leading-relaxed text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 text-sm leading-relaxed">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 text-sm leading-relaxed">{children}</ol>,
  li: ({ children }) => <li className="text-foreground">{children}</li>,
  strong: ({ children }) => <strong className="font-medium">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} className="text-brand-link hover:underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-[var(--radius-control)] bg-muted px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
};

/** Markdown as it arrives from a dream run or a source. Raw HTML in the text is never rendered. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('flex max-w-[var(--measure-prose)] flex-col gap-3', className)}>
      <ReactMarkdown components={COMPONENTS} skipHtml>
        {source}
      </ReactMarkdown>
    </div>
  );
}
