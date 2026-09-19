import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { createConfirmedUser, deleteUser, signedInClient } from './fixtures';

const inboxSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
});
const mailSchema = z.object({ HTML: z.string() });

test('a signed-out person resets a password through the delivered email and signs in again', async ({
  page,
  request,
}) => {
  const user = await createConfirmedUser('password-recovery');
  const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:55324';
  let messageId: string | undefined;
  try {
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(
      page.getByText(`Check ${user.email} for a link to set a new password.`),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const response = await request.get(`${mailpit}/api/v1/messages`);
        const inbox = inboxSchema.parse(await response.json());
        messageId = inbox.messages.find((mail) =>
          mail.To.some((recipient) => recipient.Address === user.email),
        )?.ID;
        return Boolean(messageId);
      })
      .toBe(true);
    const response = await request.get(`${mailpit}/api/v1/message/${messageId}`);
    const mail = mailSchema.parse(await response.json());
    const link = mail.HTML.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    if (!link) throw new Error('Recovery email did not contain a link.');
    await page.goto(link);
    await expect(page.getByLabel('New password')).toBeVisible();
    const password = `${user.password}-updated`;
    await page.getByLabel('New password').fill(password);
    await page.getByRole('button', { name: 'Save password' }).click();
    await page.waitForURL('**/chat');
    const freshSession = await signedInClient(user.email, password);
    const { data, error } = await freshSession.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.userId);
    await freshSession.auth.signOut();
  } finally {
    if (messageId)
      await request.delete(`${mailpit}/api/v1/messages`, { data: { IDs: [messageId] } });
    await deleteUser(user.userId);
  }
});
