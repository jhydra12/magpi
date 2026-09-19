import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { cutoverDreams } from './lib/dream-cutover.mjs';
import { projectServiceKey } from './lib/project-service.mjs';

const [flag, project, ...extra] = process.argv.slice(2);
if (flag !== '--project-ref' || !/^[a-z]{20}$/.test(project ?? '') || extra.length) {
  throw new Error('Use node scripts/dream-cutover.mjs --project-ref <project-ref>');
}
const cli = process.env.SUPABASE_COMPUTE_CLI ?? 'supabase-beta';
const serviceKey = projectServiceKey(project, cli);
const db = createClient(`https://${project}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});
await cutoverDreams({
  setMode: async (mode) => {
    const { error } = await db.rpc('set_dream_execution_mode', { p_mode: mode });
    if (error) throw new Error(`Setting Dream mode: ${error.message}`);
    console.log(`Dream execution mode: ${mode}`);
  },
  activeRuns: async () => {
    const results = await Promise.all(
      ['dream_runs', 'ingest_jobs'].map((table) =>
        db.from(table).select('id', { count: 'exact', head: true }).eq('status', 'running'),
      ),
    );
    for (const result of results) {
      if (result.error) throw new Error(`Checking active work: ${result.error.message}`);
    }
    return results.reduce((total, result) => total + (result.count ?? 0), 0);
  },
  deploy: async () => {
    const result = spawnSync(
      cli,
      ['compute', 'push', 'dream', '--project-ref', project, '--instances', '1'],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error('Compute deployment failed; Edge processing restored');
  },
  wait: () => new Promise((resolveWait) => setTimeout(resolveWait, 5000)),
});
console.log('Deployed one Compute instance. Confirm readiness before scaling to eleven.');
