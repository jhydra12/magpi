// Secrets, parsed with zod. Ours use the SB_ prefix; the SUPABASE_ names are platform-injected.

import { z } from 'zod';
import { ApiError, misconfigured } from './errors.ts';

export interface EnvSource {
  get(name: string): string | undefined;
}

export const denoEnv: EnvSource = { get: (name: string) => Deno.env.get(name) || undefined };

// Checks the scheme, because z.url() alone accepts "kong:8000" as a URL with a "kong" scheme.
const httpUrl = z
  .string()
  .refine((value) => /^https?:\/\//.test(value) && URL.canParse(value), 'must be an http(s) url');

const coreSchema = z.object({
  supabaseUrl: httpUrl,
  serviceRoleKey: z.string().min(1),
});

export type CoreEnv = z.infer<typeof coreSchema>;

/** Fails with the generic misconfiguration, naming the missing keys only in the log. */
function parseOrFail<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw misconfigured(
    `${label}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
  );
}

export function coreEnv(source: EnvSource = denoEnv): CoreEnv {
  return parseOrFail(
    coreSchema,
    {
      supabaseUrl: source.get('SUPABASE_URL'),
      serviceRoleKey: source.get('SB_SERVICE_ROLE_KEY'),
    },
    'core env',
  );
}

/** The client-safe key, used only where a caller's own JWT is verified. SB_ name wins when set. */
export function publishableKey(source: EnvSource = denoEnv): string {
  const key = source.get('SB_PUBLISHABLE_KEY') ?? source.get('SUPABASE_ANON_KEY');
  if (!key) throw misconfigured('neither SB_PUBLISHABLE_KEY nor SUPABASE_ANON_KEY is set');
  return key;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Reads SB_<SLUG>_CLIENT_ID and _CLIENT_SECRET. An unregistered provider is a 503, not a 500. */
export function oauthCredentials(slug: string, source: EnvSource = denoEnv): OAuthCredentials {
  const prefix = `SB_${slug.toUpperCase().replaceAll('-', '_')}`;
  const clientId = source.get(`${prefix}_CLIENT_ID`);
  const clientSecret = source.get(`${prefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) {
    throw new ApiError(503, 'provider_unconfigured', `${slug} is not configured`);
  }
  return { clientId, clientSecret };
}

export interface TokenEncryptionEnv {
  key: string;
  keyId: number;
  /** Decrypt-only keys still needed by rows written before the last rotation. */
  previousKeys: Map<number, string>;
}

function parseKeyId(raw: string | undefined): number {
  if (!raw) return 1;
  const id = Number(raw);
  // One byte, and 0 is reserved so a zeroed envelope cannot look valid.
  if (!Number.isInteger(id) || id < 1 || id > 255) {
    throw misconfigured(`SB_TOKEN_ENC_KEY_ID must be an integer from 1 to 255, got ${raw}`);
  }
  return id;
}

/** Parses retired keys. A malformed entry throws rather than being skipped. */
function parsePreviousKeys(raw: string | undefined): Map<number, string> {
  const entries = new Map<number, string>();
  if (!raw?.trim()) return entries;

  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(':');
    const id = Number(trimmed.slice(0, separator));
    if (separator < 1 || !Number.isInteger(id) || id < 1 || id > 255) {
      throw misconfigured('SB_TOKEN_ENC_KEYS_PREVIOUS entries must be "id:base64", id 1 to 255');
    }
    entries.set(id, trimmed.slice(separator + 1));
  }
  return entries;
}

export function tokenEncryptionEnv(source: EnvSource = denoEnv): TokenEncryptionEnv {
  const key = source.get('SB_TOKEN_ENC_KEY');
  if (!key) throw misconfigured('SB_TOKEN_ENC_KEY is not set; provider tokens cannot be used');
  return {
    key,
    keyId: parseKeyId(source.get('SB_TOKEN_ENC_KEY_ID')),
    previousKeys: parsePreviousKeys(source.get('SB_TOKEN_ENC_KEYS_PREVIOUS')),
  };
}

const stripeSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  /** The price a Team subscription is sold at. Absent means no subscription counts as Team. */
  teamPriceId: z.string().min(1).nullable(),
});

export type StripeEnv = z.infer<typeof stripeSchema>;

export function stripeEnv(source: EnvSource = denoEnv): StripeEnv {
  return parseOrFail(
    stripeSchema,
    {
      secretKey: source.get('SB_STRIPE_SECRET_KEY'),
      webhookSecret: source.get('SB_STRIPE_WEBHOOK_SECRET'),
      teamPriceId: source.get('SB_STRIPE_PRICE_TEAM') ?? null,
    },
    'stripe env',
  );
}

export function openAiKey(source: EnvSource = denoEnv): string {
  const key = source.get('OPENAI_API_KEY');
  if (!key) throw misconfigured('OPENAI_API_KEY is not set; no model can be called');
  return key;
}

/** Where a provider sends the browser back. Locally SUPABASE_URL is the internal gateway. */
export function functionsBaseUrl(source: EnvSource = denoEnv): string {
  const explicit = source.get('SB_FUNCTIONS_BASE_URL');
  if (explicit) return explicit.replace(/\/+$/, '');
  return `${coreEnv(source).supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
}

export function webBaseUrl(source: EnvSource = denoEnv): string {
  return (source.get('SB_WEB_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * A budget for a dream run started from the app, in milliseconds. Unset means the Edge Function
 * default. The keynote sets it low on the hosted project so the run on stage times out on cue.
 * Compute sets its own budget and never reads this.
 */
export function dreamRunBudgetMs(source: EnvSource = denoEnv): number | undefined {
  const raw = source.get('SB_DREAM_RUN_BUDGET_MS');
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw misconfigured('SB_DREAM_RUN_BUDGET_MS must be a positive whole number of milliseconds');
  }
  return value;
}
