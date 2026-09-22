import { expect, test } from '@playwright/test';

import { createConfirmedUser, deleteUser } from './fixtures';

test('Dream submission leaves navigation responsive and Entities can be refreshed', async ({
  page,
}) => {
  const user = await createConfirmedUser('dream-nav');
  let finishSubmission = () => {};
  const pending = new Promise<void>((resolve) => {
    finishSubmission = resolve;
  });
  await page.route('**/api/dreams/start', async (route) => {
    await pending;
    await route.fulfill({ json: { status: 'error', message: 'Test submission finished.' } });
  });
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/chat');
    await page.goto('/dreams');
    await page.getByRole('button', { name: 'Process all' }).click();
    await page.getByRole('link', { name: 'Entities', exact: true }).click();
    await expect(page).toHaveURL(/\/dreams\/entities$/);
    await expect(page.getByText('No entities yet')).toBeVisible();
    finishSubmission();
    await page.reload();
    await expect(page.getByText('No entities yet')).toBeVisible();
    await page.getByRole('link', { name: 'New chat', exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);
  } finally {
    finishSubmission();
    await deleteUser(user.userId);
  }
});

test('signed-out users can request a password reset', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});
