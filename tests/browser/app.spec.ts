import { expect, test } from '@playwright/test';

test('loads the capture interface without runtime errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Voice Lab');
  await expect(page.getByRole('heading', { name: 'Voice Lab' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Ready');
  await expect(page.getByRole('heading', { name: 'Spectrogram' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waveform' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await expect(page.getByLabel('Audio input')).toBeHidden();
  await expect(page.getByLabel('Visible history')).toBeHidden();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
  expect(errors).toEqual([]);
});

test('gives both plots most of the initial viewport and keeps settings secondary', async ({ page }) => {
  await page.goto('/');
  const geometry = await page.evaluate(() => {
    const spectrum = document.querySelector('.spectrum-canvas')!.getBoundingClientRect();
    const waveform = document.querySelector('.waveform-canvas')!.getBoundingClientRect();
    return {
      spectrumTop: spectrum.top,
      waveformBottom: waveform.bottom,
      plotShare: (spectrum.height + waveform.height) / window.innerHeight,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.spectrumTop).toBeLessThan(190);
  expect(geometry.waveformBottom).toBeLessThan(geometry.viewportHeight);
  expect(geometry.plotShare).toBeGreaterThan(0.6);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Audio input')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
  await page.getByLabel('Visible history').selectOption('5');
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();
  await expect(page.getByLabel('Visible history')).toBeHidden();
  await settings.click();
  await expect(page.getByLabel('Visible history')).toHaveValue('5');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(settings).toBeFocused();
});

test('redraws the stopped canvases after a height-only resize', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByRole('img', { name: /^Live spectrogram/ });
  await expect.poll(async () => Number(await canvas.getAttribute('height'))).toBeGreaterThan(150);
  const originalHeight = Number(await canvas.getAttribute('height'));
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: viewport.height + 160 });
  await expect.poll(async () => Number(await canvas.getAttribute('height'))).toBeGreaterThan(originalHeight);
  expect(await canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return Math.abs(canvas.height - canvas.clientHeight * Math.min(2, devicePixelRatio)) <= 1;
  })).toBe(true);
});
