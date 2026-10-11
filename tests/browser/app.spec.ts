import { expect, test } from '@playwright/test';

test('loads the foundation without runtime errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Voice Lab');
  await expect(page.getByRole('heading', { name: 'Voice Lab' })).toBeVisible();
  await expect(page.getByText(/Microphone inactive/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spectrogram' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waveform' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pitch and resonance tracking' })).toBeVisible();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
  expect(errors).toEqual([]);
});
