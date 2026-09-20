import { test, expect } from '@playwright/test';
import { readGraphColors } from '../web/components/dreams/graph-colors';

test('converts all graph colors to sRGB in a real browser, including calculated OKLCH tokens', async ({
  page,
}) => {
  await page.setContent(`<style>
    :root {
      --background: oklch(1 0 0);
      --muted-foreground: oklch(.48 .02 159);
      --primary: oklch(.52 .15 159);
      --graph-person: #0f766e;
      --graph-project: #6d28d9;
      --graph-customer: #a16207;
      --graph-decision: #c2410c;
      --graph-document: #64748b;
      --graph-shared: #0f766e;
    }
    [data-theme='dark'] {
      --background: oklch(.19 calc(.005 * .5) 159);
      --muted-foreground: oklch(calc(.19 + (.95 - .19) * .8) .00275 159);
      --graph-person: #2dd4bf;
      --graph-project: #c4b5fd;
      --graph-customer: #fde047;
      --graph-decision: #fb923c;
      --graph-document: #94a3b8;
      --graph-shared: #5eead4;
    }
  </style>`);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  const dark = await page.evaluate(readGraphColors);
  for (const color of Object.values(dark)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  expect(dark.person).toBe('#2dd4bf');
  expect(dark.document).toBe('#94a3b8');
  expect(dark.shared).toBe('#5eead4');
  expect(dark.background).not.toBe(dark.document);
  expect(dark.shared).not.toBe(dark.background);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  const light = await page.evaluate(readGraphColors);
  expect(light.background).toBe('#ffffff');
  expect(light.person).toBe('#0f766e');
  expect(light.project).toBe('#6d28d9');
  expect(light.customer).toBe('#a16207');
  expect(light.decision).toBe('#c2410c');
  expect(light.document).toBe('#64748b');
  expect(light.shared).toBe('#0f766e');
  expect(light.background).not.toBe(dark.background);
});
