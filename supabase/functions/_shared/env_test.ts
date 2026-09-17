import { assertEquals, assertThrows } from '@std/assert';

import { ApiError } from './errors.ts';
import { apiErrorFrom, envSource } from './testing/assertions.ts';
import {
  coreEnv,
  dreamRunBudgetMs,
  functionsBaseUrl,
  oauthCredentials,
  openAiKey,
  publishableKey,
  stripeEnv,
  tokenEncryptionEnv,
  webBaseUrl,
} from './env.ts';

const source = envSource;

const CORE = {
  SUPABASE_URL: 'https://project.supabase.co',
  SB_SERVICE_ROLE_KEY: 'service-role-key',
};

Deno.test('core env parses the url and the service role key', () => {
  const env = coreEnv(source(CORE));
  assertEquals(env.supabaseUrl, 'https://project.supabase.co');
  assertEquals(env.serviceRoleKey, 'service-role-key');
});

Deno.test('a missing core value is a misconfiguration, not a bad request', () => {
  const err = apiErrorFrom(() => coreEnv(source({ SUPABASE_URL: 'https://project.supabase.co' })));
  assertEquals(err.status, 500);
  assertEquals(err.code, 'misconfigured');
});

Deno.test('a core value that is not a url is refused', () => {
  assertThrows(() => coreEnv(source({ ...CORE, SUPABASE_URL: 'kong:8000' })), ApiError);
});

Deno.test('the publishable key falls back to the platform-injected anon key', () => {
  assertEquals(publishableKey(source({ SUPABASE_ANON_KEY: 'anon' })), 'anon');
  assertEquals(
    publishableKey(source({ SUPABASE_ANON_KEY: 'anon', SB_PUBLISHABLE_KEY: 'ours' })),
    'ours',
  );
  assertThrows(() => publishableKey(source({})), ApiError);
});

Deno.test("oauth credentials are read under the provider's SB_ prefix", () => {
  const creds = oauthCredentials(
    'google',
    source({ SB_GOOGLE_CLIENT_ID: 'id', SB_GOOGLE_CLIENT_SECRET: 'secret' }),
  );
  assertEquals(creds, { clientId: 'id', clientSecret: 'secret' });
});

Deno.test('a hyphenated provider slug reads under an underscored name', () => {
  const creds = oauthCredentials(
    'google-drive',
    source({ SB_GOOGLE_DRIVE_CLIENT_ID: 'id', SB_GOOGLE_DRIVE_CLIENT_SECRET: 'secret' }),
  );
  assertEquals(creds.clientId, 'id');
});

Deno.test('an unconfigured provider is a deployment state, not a server fault', () => {
  const err = apiErrorFrom(() => oauthCredentials('notion', source({})));
  assertEquals(err.status, 503);
  assertEquals(err.code, 'provider_unconfigured');
});

Deno.test('the token encryption key id defaults to 1 and must fit in a byte', () => {
  assertEquals(tokenEncryptionEnv(source({ SB_TOKEN_ENC_KEY: 'k' })).keyId, 1);
  assertEquals(
    tokenEncryptionEnv(source({ SB_TOKEN_ENC_KEY: 'k', SB_TOKEN_ENC_KEY_ID: '7' })).keyId,
    7,
  );
  assertThrows(
    () => tokenEncryptionEnv(source({ SB_TOKEN_ENC_KEY: 'k', SB_TOKEN_ENC_KEY_ID: '256' })),
    ApiError,
  );
});

Deno.test('retired encryption keys parse as id to key pairs', () => {
  const env = tokenEncryptionEnv(
    source({ SB_TOKEN_ENC_KEY: 'current', SB_TOKEN_ENC_KEYS_PREVIOUS: '1:old, 2:older' }),
  );
  assertEquals(
    [...env.previousKeys.entries()],
    [
      [1, 'old'],
      [2, 'older'],
    ],
  );
});

Deno.test('a malformed retired key entry is fatal rather than skipped', () => {
  assertThrows(
    () => tokenEncryptionEnv(source({ SB_TOKEN_ENC_KEY: 'k', SB_TOKEN_ENC_KEYS_PREVIOUS: 'old' })),
    ApiError,
  );
});

Deno.test('stripe env requires both the secret key and the webhook secret', () => {
  const env = stripeEnv(
    source({ SB_STRIPE_SECRET_KEY: 'sk_test', SB_STRIPE_WEBHOOK_SECRET: 'whsec' }),
  );
  assertEquals(env.webhookSecret, 'whsec');
  assertThrows(() => stripeEnv(source({ SB_STRIPE_SECRET_KEY: 'sk_test' })), ApiError);
});

Deno.test('the openai key is required wherever a model is called', () => {
  assertEquals(openAiKey(source({ OPENAI_API_KEY: 'sk-openai' })), 'sk-openai');
  assertThrows(() => openAiKey(source({})), ApiError);
});

Deno.test('the callback origin is the public functions url, never the internal gateway', () => {
  assertEquals(
    functionsBaseUrl(source({ ...CORE, SB_FUNCTIONS_BASE_URL: 'https://fx.example.com/' })),
    'https://fx.example.com',
  );
  assertEquals(functionsBaseUrl(source({ ...CORE })), 'https://project.supabase.co/functions/v1');
});

Deno.test('the web origin falls back to the local dev server', () => {
  assertEquals(
    webBaseUrl(source({ SB_WEB_BASE_URL: 'https://magpi.dev/' })),
    'https://magpi.dev',
  );
  assertEquals(webBaseUrl(source({})), 'http://localhost:3000');
});

Deno.test('a dream run has no budget of its own unless one is set', () => {
  assertEquals(dreamRunBudgetMs(envSource({})), undefined);
});

Deno.test('a dream run budget is read in whole milliseconds', () => {
  assertEquals(dreamRunBudgetMs(envSource({ SB_DREAM_RUN_BUDGET_MS: '20000' })), 20000);
});

Deno.test('a dream run budget that is not a positive whole number is a misconfiguration', () => {
  assertThrows(() => dreamRunBudgetMs(envSource({ SB_DREAM_RUN_BUDGET_MS: 'soon' })));
  assertThrows(() => dreamRunBudgetMs(envSource({ SB_DREAM_RUN_BUDGET_MS: '0' })));
});
