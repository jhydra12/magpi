'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// Matches .magpi-title-out. The old name is taken out of the tree once it has left.
const TITLE_LEAVE_MS = 160;

/** Crossfades a name that arrives after the row is already on screen. */
export function LiveTitle({ text }: { readonly text: string }) {
  const previous = useRef(text);
  const [leaving, setLeaving] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (previous.current === text) return;
    setLeaving(previous.current);
    previous.current = text;
  }, [text]);

  useLayoutEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), TITLE_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  return (
    <span className="magpi-title-slot">
      {leaving !== null ? (
        <span className="magpi-title-out" aria-hidden>
          {leaving}
        </span>
      ) : null}
      <span className={leaving !== null ? 'magpi-title-in' : undefined}>{text}</span>
    </span>
  );
}
