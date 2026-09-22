'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * COPY MORPH
 *    0ms  Copy is solid, Copied is blurred and invisible
 *  180ms  they crossfade; blur masks the overlap
 * 2000ms Copied returns the same way
 * ───────────────────────────────────────────────────────── */

const MORPH =
  'col-start-1 row-start-1 inline-flex items-center gap-2 transition-[opacity,filter] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:blur-none motion-reduce:transition-none';

/** Copies one string. Says so for a moment, because a silent copy reads as a broken button. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // A browser that refuses the clipboard leaves the text on screen to select by hand.
          setCopied(false);
        }
      }}
      aria-label={copied ? 'Copied' : label}
      className="overflow-hidden"
    >
      <span className="grid">
        <span
          aria-hidden
          className={cn(MORPH, copied ? 'opacity-0 blur-[2px]' : 'blur-0 opacity-100')}
        >
          <Copy />
          {label}
        </span>
        <span
          aria-hidden
          className={cn(MORPH, copied ? 'blur-0 opacity-100' : 'opacity-0 blur-[2px]')}
        >
          <Check />
          Copied
        </span>
      </span>
    </Button>
  );
}
