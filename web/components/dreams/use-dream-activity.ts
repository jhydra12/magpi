'use client';

import { useEffect, useRef, useState } from 'react';

import {
  dreamActivityResponseSchema,
  isDreamActive,
  type DreamActivitySnapshot,
} from '@/lib/dreams/activity';

/** Poll only the displayed runs; cancel on unmount and stop once all visible jobs finish. */
export function useDreamActivity(
  initial: DreamActivitySnapshot,
  onFinished: () => void,
  acceptedIds: readonly string[] = [],
) {
  const [observation, setObservation] = useState({ initial, snapshot: initial });
  const snapshot = observation.initial === initial ? observation.snapshot : initial;
  const latest = useRef(snapshot);
  useEffect(() => {
    latest.current = snapshot;
  }, [snapshot]);
  const [failure, setFailure] = useState<string | null>(null);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const acceptedKey = [...new Set(acceptedIds)].sort().join(',');
  const idsKey = [...new Set([...initial.runs.map((run) => run.id), ...acceptedIds])]
    .sort()
    .join(',');
  useEffect(() => {
    if (!initial.runs.some(isDreamActive) && acceptedKey.length === 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = latest.current;
    let missingAttempts = 0;
    const ids = idsKey.split(',').filter(Boolean);
    const poll = async () => {
      try {
        const runs = [];
        let observedAt = new Date().toISOString();
        for (let offset = 0; offset < ids.length; offset += 100) {
          const query = new URLSearchParams({ runs: ids.slice(offset, offset + 100).join(',') });
          const response = await fetch(`/api/dreams/runs?${query}`, {
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
          });
          if (controller.signal.aborted) return;
          if (response.status === 401 || response.status === 403) {
            setObservation({
              initial,
              snapshot: { runs: [], observedAt: new Date().toISOString() },
            });
            setFailure('Sign in to view Dream activity.');
            return;
          }
          if (!response.ok) throw new Error('Could not refresh Dream activity.');
          const batch = dreamActivityResponseSchema.parse(await response.json());
          runs.push(...batch.runs);
          observedAt = batch.observedAt;
        }
        const next = { runs, observedAt };
        if (controller.signal.aborted) return;
        setObservation({ initial, snapshot: next });
        setFailure(null);
        const hasFinished = next.runs.some(
          (run) =>
            !isDreamActive(run) &&
            previous.runs.some((before) => before.id === run.id && isDreamActive(before)),
        );
        previous = next;
        latest.current = next;
        if (hasFinished) onFinishedRef.current();
        const missingAccepted = acceptedKey
          .split(',')
          .filter(Boolean)
          .some((id) => !next.runs.some((run) => run.id === id));
        missingAttempts = missingAccepted ? missingAttempts + 1 : 0;
        if (missingAttempts >= 5) {
          setFailure('Some accepted Dreams could not be found. Refresh to check their status.');
          return;
        }
        if (!next.runs.some(isDreamActive) && !missingAccepted) return;
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
  }, [initial, idsKey, acceptedKey]);

  return { snapshot, failure };
}
