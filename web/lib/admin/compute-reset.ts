import 'server-only';

import { z } from 'zod';

export interface ComputeResetEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ACCESS_TOKEN?: string;
}

export type ComputeResetConfig =
  { kind: 'local' } | { kind: 'hosted'; projectRef: string; token: string };

export interface ComputeResetDependencies {
  env?: ComputeResetEnvironment;
  fetch?: typeof globalThis.fetch;
}

/** Validate before pausing database workers so a missing credential cannot strand a reset. */
export function assertComputeResetConfigured(
  env: ComputeResetEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
  },
): ComputeResetConfig {
  let url: URL;
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  } catch {
    throw new Error('Reset requires a valid Supabase project URL.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Reset requires the Supabase project origin without a path or credentials.');
  }
  if (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    return { kind: 'local' };
  }
  const projectRef = /^([a-z]{20})\.supabase\.co$/.exec(url.hostname)?.[1];
  if (url.protocol !== 'https:' || url.port || !projectRef) {
    throw new Error('Hosted reset requires an HTTPS Supabase project URL.');
  }
  const token = env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Configure the server-only SUPABASE_ACCESS_TOKEN to reset Compute.');
  return { kind: 'hosted', projectRef, token };
}

const resourceSchema = z.object({
  id: z.string().min(1),
  attributes: z.object({
    build_state: z.enum(['active', 'building', 'failed']),
    deleting: z.boolean().optional(),
  }),
});
const listSchema = z.object({ data: z.array(resourceSchema) });

async function request(
  config: Extract<ComputeResetConfig, { kind: 'hosted' }>,
  fetcher: typeof globalThis.fetch,
  method: 'GET' | 'DELETE',
  instanceId?: string,
): Promise<Response> {
  try {
    return await fetcher(
      `https://api.supabase.com/v2/projects/${config.projectRef}/compute${instanceId ? `/${encodeURIComponent(instanceId)}` : ''}`,
      {
        method,
        headers: { Authorization: `Bearer ${config.token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error('Compute management request timed out or could not connect. Retry the reset.');
  }
}

async function computeResources(
  config: Extract<ComputeResetConfig, { kind: 'hosted' }>,
  fetcher: typeof globalThis.fetch,
): Promise<z.infer<typeof resourceSchema>[]> {
  const response = await request(config, fetcher, 'GET');
  if (!response.ok) {
    throw new Error(
      `Could not verify Compute state (HTTP ${response.status}). Check management access and retry.`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Compute returned an unreadable response. Retry the reset.');
  }
  const result = listSchema.safeParse(body);
  if (!result.success)
    throw new Error('Compute returned an unexpected response. Reset remains paused.');
  return result.data.data;
}

/** Only an authoritative successful list can confirm hosted Compute is gone. */
export async function areComputeInstancesAbsent(
  dependencies: ComputeResetDependencies = {},
): Promise<boolean> {
  const config = assertComputeResetConfigured(dependencies.env);
  if (config.kind === 'local') return true;
  return (await computeResources(config, dependencies.fetch ?? globalThis.fetch)).length === 0;
}

/** Advance asynchronous teardown by one bounded step. Calling again safely polls deletion. */
export async function resetAllComputeInstances(
  dependencies: ComputeResetDependencies = {},
): Promise<{ complete: boolean }> {
  const config = assertComputeResetConfigured(dependencies.env);
  if (config.kind === 'local') return { complete: true };
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const resources = await computeResources(config, fetcher);
  if (resources.length === 0) return { complete: true };

  for (const resource of resources) {
    if (resource.attributes.deleting === true) continue;
    const response = await request(config, fetcher, 'DELETE', resource.id);
    // Another reset can change or delete a service after the list request.
    if (!response.ok && response.status !== 404 && response.status !== 409) {
      throw new Error(
        `Compute deletion failed (HTTP ${response.status}). Check management access and retry.`,
      );
    }
  }

  // Deletion is asynchronous; a later stage call must confirm the list is empty.
  return { complete: false };
}
