import { expect, test } from '@playwright/test';

// Runs in the production preview (service worker active), not the dev server.
test('loads offline after an initial online visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  // A second load with the service worker controlling the page primes the cache.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Voice Lab' })).toBeVisible();
  const guidePath = await page.getByRole('link', { name: 'Help & guide' }).getAttribute('href');
  expect(guidePath).toBeTruthy();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Voice Lab' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
  await page.goto(guidePath!);
  await expect(page.getByRole('heading', { name: 'Voice Lab guide', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Voice Lab' })).toBeVisible();
  await context.setOffline(false);
});
