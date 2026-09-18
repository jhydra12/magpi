import { build } from 'esbuild';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compute = resolve(root, 'supabase/compute/dream');
const isTest = process.argv.includes('--test');
const outdir = isTest ? resolve(root, 'build/compute-tests') : resolve(compute, 'dist');
await mkdir(outdir, { recursive: true });

const entryPoints = isTest
  ? (await readdir(resolve(compute, 'tests')))
      .filter((name) => name.endsWith('.test.ts'))
      .map((name) => resolve(compute, 'tests', name))
  : [resolve(compute, 'src/index.ts')];

await build({
  absWorkingDir: root,
  entryPoints,
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: isTest ? 'external' : 'bundle',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
