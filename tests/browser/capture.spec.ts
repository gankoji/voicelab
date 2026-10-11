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
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
    await expect.poll(async () => Number.parseFloat(await page.getByLabel('Peak level').innerText())).toBeCloseTo(-12.0, 0);
    await expect.poll(async () => Number.parseFloat(await page.getByLabel('RMS level').innerText())).toBeCloseTo(-15.1, 0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Capture details and processing', { exact: true }).click();
    await expect.poll(async () => Number(await page.getByLabel('Processed samples').innerText())).toBeGreaterThan(2048);
    await expect(page.getByText('The browser reports processing off.', { exact: false })).toBeVisible();
    // Scheduling gaps are possible under parallel browser load; they must be disclosed.
    const dropped = Number(await page.getByLabel('Dropped samples').innerText());
    expect(Number.isSafeInteger(dropped) && dropped >= 0).toBe(true);
    if (dropped > 0) await expect(page.getByText(/Audio gaps detected/)).toBeVisible();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Stopped');
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
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied');
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('changing input stops capture until the singer explicitly starts again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const input = page.getByLabel('Audio input');
  await expect.poll(() => input.locator('option').count()).toBeGreaterThan(1);
  await input.selectOption({ index: 1 });
  await expect(page.getByText(/Input changed. Press Record/)).toBeVisible();
  expect(await page.evaluate(() =>
    (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.every((track) => track.readyState === 'ended'),
  )).toBe(true);
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('releases the microphone on pagehide and never restarts automatically', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.getByText(/Microphone stopped when this page was hidden/)).toBeVisible();
  expect(await page.evaluate(() =>
    (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.every((track) => track.readyState === 'ended'),
  )).toBe(true);
  await page.reload();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Ready');
  expect(await page.evaluate(() => (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.length)).toBe(0);
});

test('draws the known tone in aligned plots, changes scales, and shows sample detail', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Visible history').selectOption('1');
  await page.getByLabel('Highest frequency (Hz)').selectOption('2000');
  await page.getByLabel('Show RMS amplitude').check();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  const wave = page.getByRole('img', { name: /^Live waveform/ });
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(60000);

  const measured = await spectrum.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ratio = canvas.width / canvas.clientWidth;
    const ctx = canvas.getContext('2d')!;
    const top = Math.round(12 * ratio);
    const height = Math.round((canvas.clientHeight - 42) * ratio);
    const x = Math.round((54 + (canvas.clientWidth - 66) * 0.65) * ratio);
    const pixels = ctx.getImageData(x, top, 1, height).data;
    let peakY = 0;
    let peak = -1;
    for (let y = 0; y < height; y++) {
      const intensity = pixels[y * 4]! + pixels[y * 4 + 1]! + pixels[y * 4 + 2]!;
      if (intensity > peak) { peak = intensity; peakY = y; }
    }
    return { frequency: 2000 - peakY / height * (2000 - 50), peak };
  });
  expect(Math.abs(measured.frequency - 440)).toBeLessThan(50);
  expect(measured.peak).toBeGreaterThan(300);
  expect(await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    return canvases[0]?.dataset.endSample === canvases[1]?.dataset.endSample;
  })).toBe(true);
  const wavePixels = await wave.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let yellow = 0;
    let teal = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
      if (r > 220 && g > 150 && b < 150) yellow++;
      else if (r > 120 && r < 220 && g > 170 && b > 150) teal++;
    }
    return { yellow, teal };
  });
  expect(wavePixels.yellow).toBeGreaterThan(10);
  expect(wavePixels.teal).toBeGreaterThan(50);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Frequency scale').selectOption('log');
  await expect(spectrum).toHaveAttribute('data-frequency-scale', 'log');
  await page.getByLabel('Analysis detail').selectOption('4096');
  await expect(spectrum).toHaveAttribute('data-fft-size', '4096');
  await page.getByLabel('Visible history').selectOption('0.005');
  await expect.poll(async () => Number(await wave.getAttribute('data-trace-samples'))).toBeGreaterThan(100);
  await expect(wave).toHaveAttribute('data-history-seconds', '0.005');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  // Stopping leaves a paused snapshot; settings stay editable for the next pass.
  await expect(page.getByLabel('Visible history')).toBeEnabled();
  await expect(page.getByLabel('Audio input')).toBeEnabled();
  await page.getByLabel('Visible history').selectOption('10');
  await expect(page.getByText(/While paused, drag or scroll/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByText(/Paused · recording stopped · linear amplitude/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('pauses the view for inspection without stopping capture, then resumes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeDisabled();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');

  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  const wave = page.getByRole('img', { name: /^Live waveform/ });
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(60000);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  // Capture keeps running while the display is paused.
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');

  await spectrum.hover();
  await expect(page.getByLabel('Spectrogram inspection')).toBeVisible();
  const spectrumText = await page.getByLabel('Spectrogram inspection').innerText();
  expect(spectrumText).toMatch(/Hz/);
  expect(spectrumText).toMatch(/dBFS|no data/);

  await wave.hover();
  await expect(page.getByLabel('Waveform inspection')).toBeVisible();
  expect(await page.getByLabel('Waveform inspection').innerText()).toMatch(/amp|no data/);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByLabel('Spectrogram inspection')).toBeHidden();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('zooms and pans a paused snapshot without stopping capture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(60000);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(0);
  const originalEnd = Number(await spectrum.getAttribute('data-end-sample'));

  await spectrum.hover();
  await page.mouse.wheel(0, -240); // zoom in around the center: the visible span shrinks.
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeLessThan(originalEnd);
  const zoomedEnd = Number(await spectrum.getAttribute('data-end-sample'));

  // Drag to pan: the end sample shifts even though the zoomed span stays the same.
  const box = await spectrum.boundingBox();
  if (!box) throw new Error('Spectrogram is not visible');
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).not.toBe(zoomedEnd);

  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('stopping recording leaves a zoomable, pannable snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Live · mic on');
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(60000);

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Capture status' })).toHaveText('Stopped');
  await expect(page.getByRole('button', { name: 'Paused' })).toBeDisabled();

  // The snapshot remains, so zoom/pan still work after the microphone is released.
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeGreaterThan(0);
  const originalEnd = Number(await spectrum.getAttribute('data-end-sample'));
  await spectrum.hover();
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => Number(await spectrum.getAttribute('data-end-sample'))).toBeLessThan(originalEnd);
});
