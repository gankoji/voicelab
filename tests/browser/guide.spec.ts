import { expect, test } from '@playwright/test';

test('opens the singer guide from the app and links back', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Help & guide' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', new URL('guide/index.html', page.url()).pathname);
  await expect(link).toHaveAttribute('target', '_blank');
  const popup = page.waitForEvent('popup');
  await link.click();
  const guide = await popup;
  await expect(guide.getByRole('heading', { name: 'Voice Lab guide', exact: true })).toBeVisible();
  expect(await guide.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await guide.locator('a[href^="#"]').evaluateAll((links) =>
    links.every((link) => !!document.getElementById(decodeURIComponent(link.getAttribute('href')!.slice(1)))),
  )).toBe(true);
  await guide.getByRole('link', { name: 'Back to Voice Lab' }).click();
  await expect(guide.getByRole('heading', { name: 'Voice Lab', exact: true })).toBeVisible();
});

test('warns before leaving an active microphone for the guide', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toContainText('mic on');
  const dialog = page.waitForEvent('dialog');
  const click = page.getByRole('link', { name: 'Help & guide' }).click();
  const prompt = await dialog;
  expect(prompt.message()).toContain('stops the microphone');
  await prompt.dismiss();
  await click;
  await expect(page.getByRole('status', { name: 'Capture status' })).toContainText('mic on');
});
