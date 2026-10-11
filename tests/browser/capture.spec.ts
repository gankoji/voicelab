import { expect, test } from '@playwright/test';

// Observe real browser tracks without replacing capture or the audio pipeline.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = window as unknown as { capturedTracks: MediaStreamTrack[] };
    tracked.capturedTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      tracked.capturedTracks.push(...stream.getTracks());
      return stream;
    };
  });
});

test('captures a known tone through the real worklet and worker, then stops and restarts', async ({ page }) => {
  const errors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'GET' || new URL(request.url()).origin !== 'http://127.0.0.1:4173') {
      unexpectedRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto('/');
  expect(await page.evaluate(() => (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.length)).toBe(0);

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Start microphone' }).click();
    await expect(page.getByText(/Microphone active — processing locally/)).toBeVisible();
    await expect.poll(async () => Number.parseFloat(await page.getByLabel('Peak level').innerText())).toBeCloseTo(-12.0, 0);
    await expect.poll(async () => Number.parseFloat(await page.getByLabel('RMS level').innerText())).toBeCloseTo(-15.1, 0);
    await page.getByText('Capture details and processing', { exact: true }).click();
    await expect.poll(async () => Number(await page.getByLabel('Processed samples').innerText())).toBeGreaterThan(2048);
    await expect(page.getByText('The browser reports processing off.', { exact: false })).toBeVisible();
    // Scheduling gaps are possible under parallel browser load; they must be disclosed.
    const dropped = Number(await page.getByLabel('Dropped samples').innerText());
    expect(Number.isSafeInteger(dropped) && dropped >= 0).toBe(true);
    if (dropped > 0) await expect(page.getByText(/Audio gaps detected/)).toBeVisible();
    await page.getByRole('button', { name: 'Stop microphone' }).click();
    await expect(page.getByText(/Microphone stopped —/)).toBeVisible();
    await expect(page.getByLabel('Peak level')).toHaveText('—');
    expect(await page.evaluate(() =>
      (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.every((track) => track.readyState === 'ended'),
    )).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});

test('explains a simulated permission denial and retries the real capture pipeline', async ({ page }) => {
  // Chromium's fake-permission flag bypasses real denial. Inject only this error;
  // the second request still uses browser capture and the real worklet/worker.
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let denyNext = true;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (denyNext) {
        denyNext = false;
        throw new DOMException('Permission denied by test', 'NotAllowedError');
      }
      return original(constraints);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied');
  await expect(page.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByText(/Microphone active — processing locally/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop microphone' }).click();
});

test('changing input stops capture until the singer explicitly starts again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByText(/Microphone active — processing locally/)).toBeVisible();
  const input = page.getByLabel('Audio input');
  await expect.poll(() => input.locator('option').count()).toBeGreaterThan(1);
  await input.selectOption({ index: 1 });
  await expect(page.getByText(/Input changed. Press Start/)).toBeVisible();
  expect(await page.evaluate(() =>
    (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.every((track) => track.readyState === 'ended'),
  )).toBe(true);
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByText(/Microphone active — processing locally/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop microphone' }).click();
});

test('releases the microphone on pagehide and never restarts automatically', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByText(/Microphone active — processing locally/)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.getByText(/Microphone stopped when this page was hidden/)).toBeVisible();
  expect(await page.evaluate(() =>
    (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.every((track) => track.readyState === 'ended'),
  )).toBe(true);
  await page.reload();
  await expect(page.getByText(/Microphone inactive/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.length)).toBe(0);
});
