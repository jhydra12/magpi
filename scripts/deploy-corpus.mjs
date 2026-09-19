import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { projectServiceKey } from './lib/project-service.mjs';
import { ingestSeed } from './lib/ingest-seed.mjs';

const project = process.env.PROJECT_ID;
const slug = process.env.DEMO_ORG_SLUG;
if (!project || !/^[a-z]{20}$/.test(project) || !slug) {
  throw new Error('PROJECT_ID and DEMO_ORG_SLUG must identify the existing demo organization');
}
const serviceKey = projectServiceKey(project);
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
