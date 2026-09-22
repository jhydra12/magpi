#!/usr/bin/env node
/** Removes the current synthetic corpus from one local demo organization. */

import { createClient } from '@supabase/supabase-js';

const slugIndex = process.argv.indexOf('--org-slug');
const slug = slugIndex < 0 ? null : process.argv[slugIndex + 1];
const isApply = process.argv.includes('--apply');
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SB_SERVICE_ROLE_KEY;

if (!slug || slug.startsWith('--'))
  throw new Error('Pass --org-slug with the exact local org slug');
if (!apiUrl || !serviceKey) throw new Error('Local Supabase URL and service key are required');
const url = new URL(apiUrl);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('This command can only clear a local Supabase project');
}

const db = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });

function unwrap(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const org = unwrap(
  await db.from('organizations').select('id, slug').eq('slug', slug).single(),
  'reading the demo organization',
);
const documents = [];
for (let start = 0; ; start += 1000) {
  const page = unwrap(
    await db
      .from('documents')
      .select('id, storage_path')
      .eq('org_id', org.id)
      .order('id')
      .range(start, start + 999),
    'reading source documents',
  );
  documents.push(...page);
  if (page.length < 1000) break;
}

const paths = documents.map((document) => document.storage_path).filter(Boolean);
if (paths.some((path) => !path.startsWith(`${org.id}/`))) {
  throw new Error('A storage path falls outside the selected organization');
}
const { count: activeDreams, error: dreamsError } = await db
  .from('dream_runs')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', org.id)
  .in('status', ['queued', 'running']);
if (dreamsError) throw new Error(`checking active Dream runs: ${dreamsError.message}`);
const { count: activeJobs, error: jobsError } = await db
  .from('ingest_jobs')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', org.id)
  .in('status', ['queued', 'running']);
if (jobsError) throw new Error(`checking active ingest jobs: ${jobsError.message}`);
if ((activeDreams ?? 0) > 0 || (activeJobs ?? 0) > 0) {
  throw new Error('Wait for active Dream and ingest work before clearing the corpus');
}

console.log(`${org.slug}: ${documents.length} documents, ${paths.length} stored files`);
if (!isApply) {
  console.log('Dry run. Pass --apply to remove this local organization’s synthetic corpus.');
  process.exit(0);
}

for (let start = 0; start < paths.length; start += 100) {
  unwrap(
    await db.storage.from('documents').remove(paths.slice(start, start + 100)),
    'removing stored source files',
  );
}

for (const [label, query] of [
  ['Dream runs', db.from('dream_runs').delete().eq('org_id', org.id)],
  ['entities', db.from('entities').delete().eq('org_id', org.id)],
  ['documents', db.from('documents').delete().eq('org_id', org.id)],
  ['model calls', db.from('model_calls').delete().eq('org_id', org.id)],
  ['usage events', db.from('usage_events').delete().eq('org_id', org.id)],
]) {
  unwrap(await query, `removing ${label}`);
}

console.log(
  'Removed the old local corpus and its generated history. Demo accounts and spaces remain.',
);
