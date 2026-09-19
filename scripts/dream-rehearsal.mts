import { readFile } from 'node:fs/promises';

import { cleanup, client, prepare, status } from './dream-rehearsal/database.mts';
import {
  batchUrl,
  manifestRunIds,
  manifestSchema,
  options,
  summarize,
  targetUrl,
} from './dream-rehearsal/model.mts';

try {
  const args = options(process.argv.slice(2));
  const url = targetUrl(process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SB_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Set SB_SERVICE_ROLE_KEY in the environment');
  const db = client(url, key);
  if (args.command === 'prepare') {
    if (!args.sourceSpace || !args.user)
      throw new Error('prepare requires --source-space and --user');
    const manifest = await prepare(db, {
      sourceSpace: args.sourceSpace,
      user: args.user,
      count: args.count,
      kind: args.kind,
      targetUrl: url,
      webUrl: targetUrl(process.env.SB_WEB_BASE_URL),
      manifestPath: args.manifest,
    });
    console.info(
      JSON.stringify(
        {
          batchId: manifest.batchId,
          queued: manifestRunIds(manifest).length,
          manifest: args.manifest,
          url: batchUrl(manifest),
        },
        null,
        2,
      ),
    );
  } else {
    const parsed: unknown = JSON.parse(await readFile(args.manifest, 'utf8'));
    const manifest = manifestSchema.parse(parsed);
    if (manifest.targetUrl !== url)
      throw new Error('Manifest target differs from the current database URL');
    if (args.command === 'status') {
      const result = await status(db, manifest);
      console.info(
        JSON.stringify(
          {
            ...summarize(manifest, result.runs, result.nonempty),
            entities: result.entities,
            mentions: result.mentions,
            links: result.links,
            url: batchUrl(manifest),
          },
          null,
          2,
        ),
      );
    } else {
      console.info(
        JSON.stringify({
          deletedSpaces: await cleanup(db, manifest, url),
          manifest: args.manifest,
        }),
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Dream rehearsal failed');
  process.exitCode = 1;
}
