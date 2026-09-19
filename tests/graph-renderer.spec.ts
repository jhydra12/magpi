import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

const bundled = build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Graph from './components/dreams/entity-graph-canvas';
      const groups = [{ kind: 'person', label: 'People', entities: Array.from({length: 20}, (_, i) => ({
        id: String(i), name: 'Person ' + i, summary: null,
        documents: [{ id: 'doc-' + Math.floor(i / 2), title: 'File ' + Math.floor(i / 2), url: null }]
      })) }];
      createRoot(document.getElementById('root')).render(<Graph groups={groups} />);`,
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
});

for (const theme of ['light', 'dark']) {
  test(`renders visible graph pixels with a matching ${theme} background and responsive controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const background = theme === 'dark' ? 'oklch(.19 calc(.005 * .5) 159)' : 'oklch(.99 .002 159)';
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.setContent(`<style>
      :root { --background: ${background}; --muted-foreground: oklch(.6 .02 159); --primary: oklch(.76 .15 159);
        --graph-person:#14b8a6; --graph-project:#8b5cf6; --graph-customer:#eab308; --graph-decision:#f97316; }
      body { margin:0; background:var(--background); }
      #root { width:900px; margin:auto; }
      section { position:relative; } section > div:first-child { width:100%; height:600px; overflow:hidden; }
    </style><button id="leave" onclick="document.querySelector('#root').remove();this.textContent='Left graph'">Leave graph</button><div id="root"></div>`);
    await page.addScriptTag({ content: (await bundled).outputFiles[0].text });
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await expect
      .poll(async () => canvas.evaluate((node) => node.getBoundingClientRect().width))
      .toBe(900);
    // Simulation stops after five seconds, then the camera fits the graph.
    await page.waitForTimeout(6000);
    const screenshot = await canvas.screenshot();
    const pixels = await page.evaluate(async (encoded) => {
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
      return { visible, background: bg };
    }, screenshot.toString('base64'));
    const pageBackground = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = getComputedStyle(document.body).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    });
    expect(pixels.background).toEqual(pageBackground);
    expect(pixels.visible).toBeGreaterThan(100);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Leave graph' }).click({ timeout: 2000 });
    await expect(page.getByText('Left graph')).toBeVisible();
  });
}
