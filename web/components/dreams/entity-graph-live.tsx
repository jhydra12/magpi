'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import {
  hasPendingDreamSubmissions,
  subscribeDreamSubmissions,
} from '@/lib/dreams/submission-events';
import { entityGraphResponseSchema, type EntityGroup } from '@/lib/dreams/entities';

import { EntityGraph } from './entity-graph';
import { EntityGroups } from './entity-groups';

/** Poll graph evidence; refresh page metadata once the active batch finishes. */
export function EntityGraphLive({
  groups: initial,
  active,
  spaceId,
}: {
  groups: readonly EntityGroup[];
  active: boolean;
  spaceId?: string;
}) {
  const router = useRouter();
  const [observation, setObservation] = useState({ initial, groups: initial, active });
  const current =
    observation.initial === initial ? observation : { initial, groups: initial, active };
  const groups = current.groups;
  const graphActive = current.active;
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let previous = JSON.stringify(initial);
    let previousActive = active;
    let isActive = active;
    let needsMetadataRefresh = active;
    let inFlight = false;
    let dirty = false;
    let failures = 0;
    const poll = async () => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      if (inFlight) {
        dirty = true;
        return;
      }
      inFlight = true;
      try {
        if (document.visibilityState !== 'hidden') {
          const query = spaceId ? `?space=${encodeURIComponent(spaceId)}` : '';
          const response = await fetch(`/api/dreams/entities${query}`, {
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
          });
          if (response.status === 401 || response.status === 403) {
            setFailure('Sign in to view entities.');
            return;
          }
          if (!response.ok) throw new Error('Could not refresh entities.');
          const next = entityGraphResponseSchema.parse(await response.json());
          if (controller.signal.aborted) return;
          const signature = JSON.stringify(next.groups);
          if (signature !== previous || next.active !== previousActive) {
            setObservation({ initial, groups: next.groups, active: next.active });
            previous = signature;
            previousActive = next.active;
          }
          setFailure(null);
          failures = 0;
          isActive = next.active;
          needsMetadataRefresh ||= isActive;
          if (!isActive && !hasPendingDreamSubmissions() && needsMetadataRefresh) {
            needsMetadataRefresh = false;
            router.refresh();
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        failures += 1;
        setFailure(
          failures < 3
            ? 'Could not refresh entities. Retrying.'
            : 'Could not refresh entities. Return to this tab to retry.',
        );
      } finally {
        inFlight = false;
      }
      if (dirty && !controller.signal.aborted) {
        dirty = false;
        void poll();
        return;
      }
      if (
        !controller.signal.aborted &&
        (isActive || hasPendingDreamSubmissions() || (failures > 0 && failures < 3))
      )
        timer = setTimeout(() => {
          void poll();
        }, 2000);
    };
    const refresh = () => {
      void poll();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    const unsubscribe = subscribeDreamSubmissions(refresh);
    document.addEventListener('visibilitychange', onVisible);
    void poll();
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      controller.abort();
      clearTimeout(timer);
    };
  }, [initial, active, spaceId, router]);
  return (
    <>
      {failure ? <p role="alert">{failure}</p> : null}
      {groups.length === 0 && !graphActive ? (
        <div className="flex min-h-64 items-start">
          <EmptyState title="No entities yet" />
        </div>
      ) : (
        <>
          <EntityGraph groups={groups} active={graphActive} />
          {groups.length > 0 ? (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-90 motion-reduce:transition-none" />
                Detail
              </summary>
              <EntityGroups groups={groups} />
            </details>
          ) : null}
        </>
      )}
    </>
  );
}
