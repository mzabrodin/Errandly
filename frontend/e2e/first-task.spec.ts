import { expect, test } from '@playwright/test';

import { linkFromEmail, PASSWORD, uniqueEmail } from './support.ts';

test('a new user signs up, creates a group, adds a task and completes it', async ({ page }) => {
  const email = uniqueEmail('Anya');

  await page.goto('/register');
  await page.getByLabel('Name').fill('Anya');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Verify your email first — the link is in the email.')).toBeVisible();

  await page.goto(await linkFromEmail(page.request, email, '/verify-email'));
  await expect(page.getByText('Email verified! You can create a group now.')).toBeVisible();
  await page.getByRole('link', { name: 'Create group' }).click();

  await page.getByLabel('Group name').fill('Room 12');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByText('Group created! Now invite your flatmates.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: 'Add task' }).first().click();
  await page.getByLabel('Title').fill('Take out the trash');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Task created and assigned to Anya')).toBeVisible();

  await page.getByRole('button', { name: 'Mark as done: Take out the trash' }).click();
  await expect(page.getByText('Nice! “Take out the trash” is done')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo: Take out the trash' })).toBeVisible();
});
