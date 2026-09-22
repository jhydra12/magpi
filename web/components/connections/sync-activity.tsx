'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  applyJobEvent,
  describeActivity,
  parseIngestJobEvent,
  summarizeJobs,
  type JobsById,
} from '@/lib/connections/activity';
import { createClient } from '@/lib/supabase/client';

import { StatusPill } from '@/components/app/status-pill';

/** The Realtime socket for import progress. The decisions live in lib/connections/activity. */
export function SyncActivity({ spaceIds }: { spaceIds: readonly string[] }) {
  const [jobs, setJobs] = useState<JobsById>(() => new Map());
  const router = useRouter();

  // The parent rebuilds this array each render, so the effect keys off the joined string.
  const watched = useRef(spaceIds);
  const watchedKey = spaceIds.join(',');

  useEffect(() => {
    watched.current = spaceIds;
  }, [spaceIds]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('connections-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingest_jobs' }, (payload) => {
        const job = parseIngestJobEvent(payload.new);
        if (job) setJobs((current) => applyJobEvent(current, job, watched.current));
      })
      // Ignore the payload: replica identity full puts access_token_enc in the WAL row.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, watchedKey]);

  const summary = summarizeJobs([...jobs.values()]);
  const description = describeActivity(summary);

  return (
    <div aria-live="polite" className="min-h-6">
      {description ? (
        <div className="flex flex-col gap-2 px-3 py-3">
          <div className="flex items-center gap-2">
            <StatusPill
              tone={summary.failures.length > 0 ? 'destructive' : 'progress'}
              label={description}
            />
          </div>
          {summary.failures.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {summary.failures.slice(0, 3).map((failure) => (
                <li key={failure.id} className="text-sm text-muted-foreground">
                  {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
