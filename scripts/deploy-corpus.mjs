import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { ingestSeed } from './lib/ingest-seed.mjs';

const project = process.env.PROJECT_ID;
const slug = process.env.DEMO_ORG_SLUG;
if (!project || !/^[a-z]{20}$/.test(project) || !slug) {
  throw new Error('PROJECT_ID and DEMO_ORG_SLUG must identify the existing demo organization');
}
const keys = spawnSync(
  'supabase',
  ['projects', 'api-keys', '--project-ref', project, '-o', 'json'],
  { encoding: 'utf8' },
);
if (keys.status !== 0) throw new Error('Unable to retrieve the demo service key');
const parsed = JSON.parse(keys.stdout);
const serviceKey = parsed.find((key) => key.name === 'service_role')?.api_key;
if (typeof serviceKey !== 'string' || !serviceKey.startsWith('eyJ')) {
  throw new Error('The project must expose its service_role key for source deployment');
}
if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${serviceKey}`);
const url = `https://${project}.supabase.co`;
const client = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: org, error } = await client
  .from('organizations')
  .select('id')
  .eq('slug', slug)
  .single();
if (error || !org)
  throw new Error(
    'Configured demo organization is missing; initialize it explicitly before release',
  );
const seed = spawnSync('node', ['scripts/seed-corpus.mjs', '--org-slug', slug], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, SB_SERVICE_ROLE_KEY: serviceKey },
  stdio: 'inherit',
});
if (seed.status !== 0) throw new Error('Source corpus reconciliation failed');
await ingestSeed(client, org.id, { functionsUrl: `${url}/functions/v1`, serviceKey });
