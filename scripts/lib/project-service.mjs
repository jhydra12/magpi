import { spawnSync } from 'node:child_process';

/** Read a deployment credential without writing it to logs or disk. */
export function projectServiceKey(project, cli = 'supabase') {
  const keys = spawnSync(cli, ['projects', 'api-keys', '--project-ref', project, '-o', 'json'], {
    encoding: 'utf8',
  });
  if (keys.status !== 0) throw new Error('Unable to retrieve the demo service key');
  const serviceKey = JSON.parse(keys.stdout).find((key) => key.name === 'service_role')?.api_key;
  if (typeof serviceKey !== 'string' || !serviceKey.startsWith('eyJ')) {
    throw new Error('The project must expose its service_role key for this operation');
  }
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${serviceKey}`);
  return serviceKey;
}
