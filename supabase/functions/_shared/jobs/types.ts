// What a job body is handed: a record plus injected clients, so a test can run it with no server.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EnvSource } from '../env.ts';
import type { ModelRunner } from '../model_client.ts';
import type { DreamEvent } from './dream_pass.ts';
import type { SourceDeps } from '../sources/contract.ts';

/** Where an uploaded file's bytes come from. Separate so a test needs no bucket. */
export interface UploadStore {
  read(storagePath: string): Promise<Uint8Array>;
}

export interface JobDeps {
  /** Service role. These functions are the privileged path and check their own scope. */
  db: SupabaseClient;
  /** fetch and the clock, shared with the source drivers. */
  http: SourceDeps;
  models: ModelRunner;
  uploads: UploadStore;
  env?: EnvSource;
  /** Overridden in tests to prove the timeout path without waiting for it. */
  budgetMs?: number;
  /** Structured processing events containing identifiers and counts only. */
  observeDream?: (event: DreamEvent) => void;
}

export type IngestStage = 'fetch' | 'extract' | 'chunk' | 'embed' | 'store';

/** A row in usage_events, written as it happens when a job does the thing a plan meters. */
export interface UsageEvent {
  orgId: string;
  kind:
    | 'document_ingested'
    | 'chunk_embedded'
    | 'query'
    | 'dream_run'
    | 'embedding_tokens'
    | 'chat_tokens'
    | 'storage_bytes';
  quantity: number;
}

export async function recordUsage(db: SupabaseClient, events: UsageEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await db.from('usage_events').insert(
    events.map((event) => ({ org_id: event.orgId, kind: event.kind, quantity: event.quantity })),
  );
  // Metering failures are logged rather than thrown, so finished work still counts.
  if (error) console.error('usage events could not be written', error.message);
}
