'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * COPY MORPH
 *    0ms  the visible label is solid, at its own width
 *  180ms  crossfade; blur masks the overlap; width eases with it
 * 2000ms the confirmation returns the same way
 * "Copied" is out of flow, so the resting button is Copy's width.
 * The track then eases between the two measured widths.
 * ───────────────────────────────────────────────────────── */

const EASE = 'ease-[cubic-bezier(0.23,1,0.32,1)]';
const DURATION = 'duration-[180ms]';

const MORPH = `col-start-1 row-start-1 inline-flex w-max items-center gap-2 transition-[opacity,filter] ${DURATION} ${EASE} motion-reduce:blur-none motion-reduce:transition-[opacity] motion-reduce:duration-150`;

/** Width of the label that is actually showing, so the button can ease between them. */
function useActiveLabelWidth(copied: boolean, label: string) {
  const copyRef = useRef<HTMLSpanElement>(null);
  const copiedRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const active = copied ? copiedRef.current : copyRef.current;
    if (!active) return;

    const measure = () => {
      const next = active.offsetWidth;
      if (next === 0) return;
      setWidth((current) => (current === next ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(active);
    return () => observer.disconnect();
  }, [copied, label]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return { copyRef, copiedRef, width, animate };
}

/** Copies one string. Says so for a moment, because a silent copy reads as a broken button. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { copyRef, copiedRef, width, animate } = useActiveLabelWidth(copied, label);

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
    >
      <span
        className={cn(
          'relative grid min-w-0 justify-items-start',
          animate && `transition-[width] ${DURATION} ${EASE} motion-reduce:transition-none`,
        )}
        style={{ width }}
      >
        <span
          ref={copyRef}
          aria-hidden
          className={cn(MORPH, copied ? 'opacity-0 blur-[2px]' : 'blur-0 opacity-100')}
        >
          <Copy />
          {label}
        </span>
        <span
          ref={copiedRef}
          aria-hidden
          className={cn(
            MORPH,
            'absolute top-0 left-0',
            copied ? 'blur-0 opacity-100' : 'opacity-0 blur-[2px]',
          )}
        >
          <Check />
          Copied
        </span>
      </span>
    </Button>
  );
}
