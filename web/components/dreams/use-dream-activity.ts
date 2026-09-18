'use client';

import { useEffect, useRef, useState } from 'react';

import {
  dreamActivityResponseSchema,
  isDreamActive,
  type DreamActivitySnapshot,
} from '@/lib/dreams/activity';

/** Poll only the displayed runs; cancel on unmount and stop once all visible jobs finish. */
export function useDreamActivity(initial: DreamActivitySnapshot, onFinished: () => void) {
  const [observation, setObservation] = useState({ initial, snapshot: initial });
  const snapshot = observation.initial === initial ? observation.snapshot : initial;
  const [failure, setFailure] = useState<string | null>(null);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!initial.runs.some(isDreamActive)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = initial;
    const query = new URLSearchParams({ runs: initial.runs.map((run) => run.id).join(',') });
    const poll = async () => {
      try {
        const response = await fetch(`/api/dreams/runs?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setObservation({ initial, snapshot: { runs: [], observedAt: new Date().toISOString() } });
          setFailure('Sign in to view Dream activity.');
          return;
        }
        if (!response.ok) throw new Error('Could not refresh Dream activity.');
        const next = dreamActivityResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setObservation({ initial, snapshot: next });
        setFailure(null);
        const hasFinished = next.runs.some(
          (run) =>
            !isDreamActive(run) &&
            previous.runs.some((before) => before.id === run.id && isDreamActive(before)),
        );
        previous = next;
        if (hasFinished) onFinishedRef.current();
        if (!next.runs.some(isDreamActive)) return;
      } catch {
        if (controller.signal.aborted) return;
        setFailure('Could not refresh Dream activity. Retrying.');
      }
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    };
    timer = setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [initial]);

  return { snapshot, failure };
}
