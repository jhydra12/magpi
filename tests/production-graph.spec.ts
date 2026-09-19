import { expect, test } from '@playwright/test';

import { createConfirmedUser, deleteUser, serviceClient } from './fixtures';

/** Renderer fixtures belong only to this disposable account, never the demo corpus. */
test('production Entities route paints in both themes and allows navigation', async ({ page }) => {
  const user = await createConfirmedUser('production-graph');
  const db = serviceClient();
  try {
    const { data: space, error: spaceError } = await db
      .from('spaces')
      .select('id, org_id')
      .eq('owner_user_id', user.userId)
      .single();
    if (spaceError || !space) throw new Error('Could not find the test personal space.');
    const scope = { org_id: space.org_id, space_id: space.id };
    const { data: document, error: documentError } = await db
      .from('documents')
      .insert({ ...scope, title: 'Renderer test document', origin: 'upload' })
      .select('id')
      .single();
    if (documentError || !document) throw new Error('Could not create the renderer test document.');
    const { data: chunk, error: chunkError } = await db
      .from('chunks')
      .insert({
        ...scope,
        document_id: document.id,
        ordinal: 0,
        content: 'Renderer fixture shared evidence.',
      })
      .select('id')
      .single();
    if (chunkError || !chunk) throw new Error('Could not create renderer test evidence.');
    const { data: entities, error: entityError } = await db
      .from('entities')
      .insert(
        Array.from({ length: 12 }, (_, index) => ({
          ...scope,
          kind: 'person',
          name: `Renderer person ${index}`,
          canonical_name: `renderer-person-${index}`,
        })),
      )
      .select('id');
    if (entityError || !entities) throw new Error('Could not create renderer test entities.');
    const { error: mentionError } = await db.from('entity_mentions').insert(
      entities.map((entity) => ({
        entity_id: entity.id,
        document_id: document.id,
        chunk_id: chunk.id,
        space_id: space.id,
      })),
    );
    if (mentionError) throw new Error('Could not connect renderer test evidence.');

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/chat');
    await page.goto('/dreams/entities');
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
      await expect
        .poll(
          async () => {
            const png = await canvas.screenshot();
            return page.evaluate(async (encoded) => {
              const image = await createImageBitmap(
                new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], {
                  type: 'image/png',
                }),
              );
              const sample = document.createElement('canvas');
              sample.width = image.width;
              sample.height = image.height;
              const context = sample.getContext('2d');
              if (!context) throw new Error('Canvas unavailable');
              context.drawImage(image, 0, 0);
              const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
              const background = Array.from(pixels.slice(0, 3));
              let visible = 0;
              for (let offset = 0; offset < pixels.length; offset += 4) {
                if (
                  background.some(
                    (channel, index) => Math.abs(channel - pixels[offset + index]) > 25,
                  )
                )
                  visible++;
              }
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
                '--background',
              );
              context.fillRect(0, 0, 1, 1);
              const pageColor = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
              return {
                visible: visible > 100,
                matches: background.every(
                  (channel, index) => Math.abs(channel - pageColor[index]) <= 8,
                ),
              };
            }, png.toString('base64'));
          },
          { timeout: 20_000 },
        )
        .toEqual({ visible: true, matches: true });
    }
    expect(errors).toEqual([]);
    await page.getByRole('link', { name: 'Chat', exact: true }).click({ timeout: 2000 });
    await expect(page).toHaveURL(/\/chat$/);
  } finally {
    await deleteUser(user.userId);
  }
});
