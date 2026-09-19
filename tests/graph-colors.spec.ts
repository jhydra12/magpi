import { test, expect } from '@playwright/test';
import { readGraphColors } from '../web/components/dreams/graph-colors';

test('converts all graph colors to sRGB in a real browser, including calculated OKLCH tokens', async ({
  page,
}) => {
  await page.setContent(`<style>:root {
    --background: oklch(.19 calc(.005 * .5) 159);
    --muted-foreground: oklch(calc(.19 + (.95 - .19) * .8) .00275 159);
    --primary: oklch(.76 .15 159);
    --graph-person: #14b8a6;
    --graph-project: #8b5cf6;
    --graph-customer: #eab308;
    --graph-decision: #f97316;
  }</style>`);
  const dark = await page.evaluate(readGraphColors);
  for (const color of Object.values(dark)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  expect(dark.person).toBe('#14b8a6');
  expect(dark.background).not.toBe(dark.document);
  expect(dark.link).not.toBe(dark.background);
  await page.addStyleTag({ content: ':root { --background: oklch(1 0 0); }' });
  const light = await page.evaluate(readGraphColors);
  expect(light.background).toBe('#ffffff');
  expect(light.background).not.toBe(dark.background);
});
