import { expect, test } from '@playwright/test';

// Privacy: audio processing is local. No cross-origin, non-GET, or body-bearing
// requests may leave the page across capture, pause, and export.
test('sends no audio and makes only same-origin GET requests', async ({ page }) => {
  const requests: { url: string; method: string; hasBody: boolean }[] = [];
  page.on('request', (request) => {
    requests.push({ url: request.url(), method: request.method(), hasBody: Boolean(request.postDataBuffer()) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(60000);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();
  const downloads: unknown[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.getByRole('button', { name: 'Export' }).click();
  await expect.poll(() => downloads.length).toBe(3);

  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();

  expect(requests.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  for (const request of requests) {
    expect(new URL(request.url).origin).toBe(origin);
    expect(request.method).toBe('GET');
    expect(request.hasBody).toBe(false);
  }
});