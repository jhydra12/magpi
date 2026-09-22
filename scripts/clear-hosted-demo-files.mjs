#!/usr/bin/env node
/** One-time removal of the old hosted demo corpus's physical Storage objects. */

import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const TARGET = {
  projectRef: 'vvfegdrzrzjyekvrfyoj',
  orgId: '2486af3d-49b5-4775-817d-ddf2f0e49cae',
  orgSlug: 'jane-a4b1b777',
  bucket: 'documents',
};
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;

function dataOrThrow(result, action) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  if (result.data == null) throw new Error(`${action}: no data returned`);
  return result.data;
}

async function readPages(buildQuery, action) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = dataOrThrow(await buildQuery().range(offset, offset + PAGE_SIZE - 1), action);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function checkIdle(db) {
  for (const [table, label] of [
    ['dream_runs', 'Dream runs'],
    ['ingest_jobs', 'ingest jobs'],
  ]) {
    const result = await db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('org_id', TARGET.orgId)
      .in('status', ['queued', 'running']);
    if (result.error) throw new Error(`Checking ${label}: ${result.error.message}`);
    if (result.count == null) throw new Error(`Checking ${label}: count unavailable`);
    if (result.count > 0) throw new Error(`${result.count} active ${label}; wait before cleanup`);
  }
}

function checkDocumentPath(document, knownSpaces) {
  if (!knownSpaces.has(document.space_id)) {
    throw new Error(`Document ${document.id} belongs to an unexpected space`);
  }
  const path = document.storage_path;
  if (path == null) return null;
  if (typeof path !== 'string' || path.includes('\\') || path.includes('\0')) {
    throw new Error(`Document ${document.id} has an invalid Storage path`);
  }
  const segments = path.split('/');
  if (
    segments.length < 2 ||
    ![TARGET.orgId, document.space_id].includes(segments[0]) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Document ${document.id} has a path outside its organization or space`);
  }
  return path;
}

/** Read the exact files linked to this demo organization without changing anything. */
export async function inspectHostedDemoFiles(db) {
  const org = dataOrThrow(
    await db.from('organizations').select('id,slug').eq('id', TARGET.orgId).single(),
    'Reading the demo organization',
  );
  if (org.slug !== TARGET.orgSlug) throw new Error('Demo organization slug does not match');

  const spaces = await readPages(
    () => db.from('spaces').select('id').eq('org_id', TARGET.orgId).order('id'),
    'Reading demo spaces',
  );
  const knownSpaces = new Set(spaces.map((space) => space.id));
  const documents = await readPages(
    () =>
      db
        .from('documents')
        .select('id,space_id,storage_path')
        .eq('org_id', TARGET.orgId)
        .order('id'),
    'Reading demo documents',
  );
  await checkIdle(db);

  const paths = new Set();
  let withoutFile = 0;
  let orgPaths = 0;
  let spacePaths = 0;
  for (const document of documents) {
    const path = checkDocumentPath(document, knownSpaces);
    if (!path) {
      withoutFile++;
      continue;
    }
    if (!paths.has(path)) {
      paths.add(path);
      if (path.startsWith(`${TARGET.orgId}/`)) orgPaths++;
      else spacePaths++;
    }
  }

  return {
    documentCount: documents.length,
    uniqueFileCount: paths.size,
    withoutFile,
    orgPaths,
    spacePaths,
    paths: [...paths],
  };
}

/** Delete only files in a previously checked inventory; database rows remain intact. */
export async function removeHostedDemoFiles(
  db,
  inventory,
  expectedDocuments,
  expectedFiles,
  report,
) {
  if (
    !Number.isSafeInteger(expectedDocuments) ||
    !Number.isSafeInteger(expectedFiles) ||
    expectedDocuments < 1 ||
    expectedFiles < 1 ||
    inventory.documentCount !== expectedDocuments ||
    inventory.uniqueFileCount !== expectedFiles
  ) {
    throw new Error('Expected document and file counts must exactly match the dry run');
  }
  await checkIdle(db);
  for (let offset = 0; offset < inventory.paths.length; offset += DELETE_BATCH_SIZE) {
    const batch = inventory.paths.slice(offset, offset + DELETE_BATCH_SIZE);
    dataOrThrow(
      await db.storage.from(TARGET.bucket).remove(batch),
      `Removing Storage files ${offset + 1}-${offset + batch.length}`,
    );
    report(`Processed ${offset + batch.length}/${inventory.paths.length} Storage paths`);
  }
}

function parseArguments(args) {
  const apply = args.includes('--apply');
  const expectedDocumentsArg = args.find((arg) => arg.startsWith('--expect-documents='));
  const expectedFilesArg = args.find((arg) => arg.startsWith('--expect-files='));
  const allowed = new Set([apply && '--apply', expectedDocumentsArg, expectedFilesArg]);
  if (args.some((arg) => !allowed.has(arg))) {
    throw new Error('Use only --apply --expect-documents=N --expect-files=N');
  }
  if (apply && (!expectedDocumentsArg || !expectedFilesArg)) {
    throw new Error('Apply requires --expect-documents=N and --expect-files=N');
  }
  return {
    apply,
    expectedDocuments: Number(expectedDocumentsArg?.split('=')[1]),
    expectedFiles: Number(expectedFilesArg?.split('=')[1]),
  };
}

async function main() {
  const { apply, expectedDocuments, expectedFiles } = parseArguments(process.argv.slice(2));
  if (process.env.DOPPLER_PROJECT !== 'select-2026-demo' || process.env.DOPPLER_CONFIG !== 'prd') {
    throw new Error('Run through Doppler project select-2026-demo, config prd');
  }
  const key = process.env.SB_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SB_SERVICE_ROLE_KEY is missing');
  const url = `https://${TARGET.projectRef}.supabase.co`;
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configuredUrl && configuredUrl !== url) {
    throw new Error('Configured Supabase URL differs from the intended project');
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const inventory = await inspectHostedDemoFiles(db);
  console.log(`${TARGET.projectRef} / ${TARGET.orgSlug}: ${inventory.documentCount} documents`);
  console.log(
    `${inventory.uniqueFileCount} unique linked file paths (${inventory.orgPaths} organization paths, ${inventory.spacePaths} personal/team space paths); ${inventory.withoutFile} documents without paths`,
  );
  if (!apply) {
    console.log('Dry run only. Database rows and Storage files are unchanged.');
    return;
  }
  await removeHostedDemoFiles(db, inventory, expectedDocuments, expectedFiles, console.log);
  console.log('Storage cleanup complete. Database rows remain for the one-time SQL reset.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
