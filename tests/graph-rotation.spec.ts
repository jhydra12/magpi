import { test, expect } from '@playwright/test';
import { build, type Plugin } from 'esbuild';
import path from 'node:path';

const linkShim: Plugin = {
  name: 'next-link-shim',
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({
      path: 'next-link-shim',
      namespace: 'next-link-shim',
    }));
    build.onLoad({ filter: /.*/, namespace: 'next-link-shim' }, () => ({
      contents: `import React from 'react';
        export default function Link({ href, children, ...props }) {
          return React.createElement('a', { href, ...props }, children);
        }`,
      loader: 'js',
      resolveDir: path.resolve('web'),
    }));
  },
};

/**
 * A graph of a few hundred names, which is what a seeded space really produces. The small
 * fixture in graph-renderer.spec.ts settles inside the renderer's default 2000 unit far plane
 * and so cannot catch a camera that frames the graph from beyond it, which draws a black box.
 */
const bundled = build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Graph from './components/dreams/entity-graph-canvas';
      const groups = [{ kind: 'project', label: 'Projects', entities: Array.from({length: 400}, (_, i) => ({
        id: String(i), name: 'Thing ' + i, summary: null,
        documents: [0, 1].map((o) => ({ id: 'doc-' + ((i + o) % 120), title: 'File ' + ((i + o) % 120), url: null }))
      })) }];
      createRoot(document.getElementById('root')).render(<Graph groups={groups} active={false} />);`,
    resolveDir: path.resolve('web'),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  tsconfig: path.resolve('web/tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [linkShim],
});

/** Pixels that differ from the corner colour, which is the background. */
async function visiblePixels(page: import('@playwright/test').Page, shot: Buffer): Promise<number> {
  return page.evaluate(async (encoded) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], { type: 'image/png' }),
    );
    const sample = document.createElement('canvas');
    sample.width = image.width;
    sample.height = image.height;
    const ctx = sample.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, sample.width, sample.height).data;
    const bg = [...rgba.slice(0, 3)];
    let visible = 0;
    for (let i = 0; i < rgba.length; i += 4)
      if (Math.max(...bg.map((value, channel) => Math.abs(value - rgba[i + channel]))) > 25)
        visible++;
    return visible;
  }, shot.toString('base64'));
}

test('frames a large graph instead of leaving the canvas black', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.setContent(`<style>
    :root { --background: oklch(.19 calc(.005 * .5) 159); --muted-foreground: oklch(.6 .02 159);
      --foreground: oklch(.97 .002 159); --tertiary-foreground: oklch(.5 .02 159);
      --border: oklch(.3 .01 159); --muted: oklch(.25 .01 159); --primary: oklch(.76 .15 159);
      --ring: oklch(.76 .15 159); --destructive-600: #ef4444; --radius-panel: 12px;
      --graph-person:#2dd4bf; --graph-project:#c4b5fd; --graph-customer:#fde047;
      --graph-decision:#fb923c; --graph-document:#94a3b8; --graph-shared:#5eead4; }
    body { margin:0; background:var(--background); }
    #root { width:min(1100px,100vw); margin:auto; }
    section { position:relative; }
    .entity-graph-stage { width:100%; height:680px; overflow:hidden; }
  </style><div id="root"></div>`);
  await page.addScriptTag({ content: (await bundled).outputFiles[0].text });

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('status')).toContainText('400 entities');

  // Long enough for the simulation to settle and the camera to take its final frame.
  await page.waitForTimeout(9000);
  const settled = await visiblePixels(page, await canvas.screenshot());
  expect(settled).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
