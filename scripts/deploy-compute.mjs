import { spawnSync } from 'node:child_process';
import { deployedInstanceCount } from './lib/compute-deployment.mjs';
const project = process.env.PROJECT_ID;
if (!project) throw new Error('PROJECT_ID is required');
const status = spawnSync(
  'supabase',
  ['compute', 'status', 'dream', '--project-ref', project, '-o', 'json'],
  { encoding: 'utf8' },
);
if (status.status !== 0)
  throw new Error('Cannot read current Compute configuration; refusing to change instance count');
const current = JSON.parse(status.stdout);
const instances = deployedInstanceCount(current);
const deployed = spawnSync(
  'supabase',
  ['compute', 'push', 'dream', '--project-ref', project, '--instances', String(instances)],
  { stdio: 'inherit' },
);
process.exitCode = deployed.status ?? 1;
