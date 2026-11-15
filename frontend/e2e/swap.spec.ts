import { expect, test } from '@playwright/test';

import { createGroup, createTask, join, signUp } from './support.ts';

test('a member offers a swap and the other side accepts it', async ({ browser }) => {
  const anya = await signUp(browser, 'Anya');
  const bohdan = await signUp(browser, 'Bohdan');
  const groupId = await createGroup(anya, 'Room 12');
  await join(anya, bohdan, groupId);
  const dishes = await createTask(anya, groupId, 'Wash the dishes', anya);
  await createTask(anya, groupId, 'Vacuum the hall', bohdan);

  await anya.page.goto(`/g/${groupId}/tasks/${dishes}`);
  await anya.page.getByRole('button', { name: 'Offer a swap' }).click();
  await anya.page
    .getByRole('dialog')
    .getByRole('button', { name: /Vacuum the hall/ })
    .click();
  await expect(anya.page.getByText('Swap offered to Bohdan')).toBeVisible();

  await bohdan.page.goto(`/g/${groupId}/tasks`);
  await expect(bohdan.page.getByText('Anya offers to swap tasks')).toBeVisible();
  await bohdan.page.getByRole('button', { name: 'Accept' }).click();
  await expect(bohdan.page.getByText('Swap accepted')).toBeVisible();
  await expect(
    bohdan.page.getByRole('button', { name: 'Mark as done: Wash the dishes' }),
  ).toBeVisible();
});
