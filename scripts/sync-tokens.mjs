#!/usr/bin/env node
/** Vendors Supabase design tokens: node scripts/sync-tokens.mjs /path/to/supabase/supabase. */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST_ROOT = join(REPO_ROOT, 'web/styles/supabase');

/** Order matters: `unset-tw-colors.css` must land before `colors.css`. */
const FILES = [
  'packages/config/tailwind.config.css',
  'packages/ui/build/css/source/global.css',
  'packages/ui/build/css/source/semantic.css',
  'packages/ui/build/css/source/compat.css',
  'packages/ui/build/css/themes/dark.css',
  'packages/ui/build/css/themes/light.css',
  'packages/config/unset-tw-colors.css',
  'packages/config/css/colors.css',
  'packages/config/css/theme.css',
  'packages/config/css/variants.css',
  'packages/config/css/base.css',
  'packages/config/css/utilities.css',
  'packages/config/css/animations.css',
  'packages/config/tailwind-plugins/hit-area.css',
  'packages/config/typography.config.js',
];

function upstreamSha(checkout) {
  try {
    return execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function main() {
  const checkout = process.argv[2];
  if (!checkout) {
    console.error('usage: node scripts/sync-tokens.mjs <path-to-supabase/supabase-checkout>');
    process.exit(1);
  }

  const source = resolve(checkout);
  if (!existsSync(source)) {
    console.error(`checkout not found: ${source}`);
    process.exit(1);
  }

  const missing = FILES.filter((f) => !existsSync(join(source, f)));
  if (missing.length > 0) {
    console.error('missing upstream files:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  for (const file of FILES) {
    const dest = join(DEST_ROOT, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(source, file), dest);
    console.log(`  ${file}`);
  }

  const sha = upstreamSha(source);
  writeFileSync(
    join(DEST_ROOT, 'UPSTREAM'),
    [
      'supabase/supabase design tokens, vendored.',
      '',
      `commit: ${sha}`,
      `synced: ${new Date().toISOString().slice(0, 10)}`,
      `files:  ${FILES.length}`,
      '',
      'Never hand-edit a file under this directory. Digital Brain overrides live in',
      'web/styles/tokens.css, which loads last. Re-run scripts/sync-tokens.mjs',
      'against a newer checkout to take upstream changes as a reviewable diff.',
      '',
    ].join('\n'),
  );

  console.log(`\nvendored ${FILES.length} files at ${sha.slice(0, 10)}`);
}

main();
