import { expect, test, type Page } from '@playwright/test';

import { PASSWORD, signUp } from './support.ts';

async function signIn(page: Page, password: string): Promise<void> {
  await page.getByLabel('Password', { exact: true }).fill(password);
  const response = page.waitForResponse('**/api/auth/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await response;
}

test('the fifth wrong password locks sign-in, even with the right one', async ({
  browser,
  page,
}) => {
  const { email } = await signUp(browser, 'Anya', { verified: false });

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  for (let attempt = 1; attempt < 5; attempt++) {
    await signIn(page, 'Wrong1234');
    await expect(page.getByText('Wrong email or password')).toBeVisible();
  }

  await signIn(page, 'Wrong1234');
  await expect(page.getByText('Sign-in is locked for 15 min', { exact: false })).toBeVisible();

  await signIn(page, PASSWORD);
  await expect(page.getByText('Sign-in is locked for 15 min', { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
