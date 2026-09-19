'use client';

let pending = 0;
const listeners = new Set<() => void>();

/** Tracks browser submissions across route changes until their HTTP calls finish. */
export function beginDreamSubmission(): () => void {
  pending += 1;
  for (const listener of listeners) listener();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending -= 1;
    for (const listener of listeners) listener();
  };
}

export function hasPendingDreamSubmissions(): boolean {
  return pending > 0;
}

export function subscribeDreamSubmissions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
