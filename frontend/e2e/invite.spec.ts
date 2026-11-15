import { expect, test } from '@playwright/test';

import { createGroup, linkFromEmail, PASSWORD, signUp, uniqueEmail } from './support.ts';

test('a flatmate opens an invitation, signs up and joins the group', async ({ browser, page }) => {
  const admin = await signUp(browser, 'Anya');
  const groupId = await createGroup(admin, 'Room 12');

  await admin.page.goto(`/g/${groupId}/members`);
  await admin.page.getByRole('button', { name: 'Invite' }).click();
  await admin.page.getByRole('button', { name: 'Create link' }).click();
  const link = await admin.page.getByLabel('Invitation link').inputValue();

  const email = uniqueEmail('Bohdan');
  await page.goto(link);
  await expect(page.getByText('Anya invites you to the group “Room 12”.')).toBeVisible();
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Name').fill('Bohdan');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`We sent an email to ${email}`, { exact: false })).toBeVisible();

  await page.goto(await linkFromEmail(page.request, email, '/verify-email'));
  await expect(page.getByText('Email verified! You can accept the invitation now.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to the invitation' }).click();
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('You joined the group “Room 12”')).toBeVisible();

  await admin.page.reload();
  await expect(admin.page.getByText('Bohdan', { exact: true })).toBeVisible();
});
