import { expect, test } from '@playwright/test';
import { encodeWav } from '../../src/export/export';

test('plays and edits an imported selection with undo', async ({ page }) => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 220 * i / 48000));
  await page.goto('/');
  await page.getByLabel('Choose audio file').setInputFiles({
    name: 'edit.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav(samples, 48000)),
  });
  await expect(page.getByText('Imported · edit.wav')).toBeVisible({ timeout: 30000 });
  await page.getByText('Playback and editing', { exact: true }).click();
  await page.getByRole('button', { name: 'Play view' }).click();
  await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop playback' }).click();
  await page.getByLabel('Start (seconds)').fill('0.1');
  await page.getByLabel('End (seconds)').fill('0.3');
  await page.getByRole('button', { name: 'Set selection' }).click();
  await page.getByRole('button', { name: 'Cut selection' }).click();
  await expect(page.getByText(/Edit complete/)).toBeVisible({ timeout: 30000 });
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  await expect(spectrum).toHaveAttribute('data-end-sample', '38400');
  await page.getByLabel('Paste at sample').fill('4800');
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(spectrum).toHaveAttribute('data-end-sample', '48000', { timeout: 30000 });
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(spectrum).toHaveAttribute('data-end-sample', '38400');
});

test('selects a frequency band by dragging on the spectrogram', async ({ page }) => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => 0.4 * Math.sin(2 * Math.PI * 440 * i / 48000));
  await page.goto('/');
  await page.getByLabel('Choose audio file').setInputFiles({
    name: 'band.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav(samples, 48000)),
  });
  await expect(page.getByText('Imported · band.wav')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Frequency band', exact: true }).click();
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  const rect = (await spectrum.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.7, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.frequency-band-overlay')).toBeVisible();
  await page.getByText('Playback and editing', { exact: true }).click();
  const low = Number(await page.getByLabel('Low frequency (Hz)').inputValue());
  const high = Number(await page.getByLabel('High frequency (Hz)').inputValue());
  expect(high).toBeGreaterThan(low);
  expect(low).toBeGreaterThan(1000);
});

test('selects an imported interval by keyboard and reports measured overtones', async ({ page }) => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) =>
    0.4 * Math.sin(2 * Math.PI * 220 * i / 48000) + 0.2 * Math.sin(2 * Math.PI * 440 * i / 48000));
  await page.goto('/');
  await page.getByLabel('Choose audio file').setInputFiles({
    name: 'harmonics.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav(samples, 48000)),
  });
  await expect(page.getByText('Imported · harmonics.wav')).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Start (seconds)').fill('0.1');
  await page.getByLabel('End (seconds)').fill('0.9');
  await page.getByRole('button', { name: 'Set selection' }).click();
  await expect(page.getByText('Selected 0.100–0.900 s')).toBeVisible();
  await expect(page.getByText(/H2: (439|440)/)).toBeVisible();
  const canvas = page.getByRole('img', { name: /^Live spectrogram/ });
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12 + (1 - (440 - 50) / (10000 - 50)) * (bounds.height - 42));
  await expect(page.getByLabel('Spectrogram inspection')).toContainText('H2 selection average');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(page.getByText('No time selection')).toBeVisible();
});

test('opens a local recording, analyzes it and keeps it after a failed import', async ({ page }) => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => 0.4 * Math.sin(2 * Math.PI * 220 * i / 48000));
  await page.goto('/');
  const input = page.getByLabel('Choose audio file');
  await input.setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav(samples, 48000)) });
  await expect(page.getByText('Imported · tone.wav')).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel('Current pitch')).toContainText('220');
  await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();
  const spectrum = page.getByRole('img', { name: /^Live spectrogram/ });
  await expect(spectrum).toHaveAttribute('data-end-sample', '48000');

  await input.setInputFiles({ name: 'bad.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') });
  await expect(page.getByText(/Could not decode/)).toBeVisible();
  await expect(page.getByText('Imported · tone.wav')).toBeVisible();
});

test('opens and navigates a recording longer than the previous two-minute limit', async ({ page }) => {
  test.setTimeout(180000);
  const sampleRate = 8000;
  const samples = new Float32Array(121 * sampleRate);
  await page.goto('/');
  await page.getByLabel('Choose audio file').setInputFiles({
    name: 'long.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav(samples, sampleRate)),
  });
  await expect(page.getByText('Imported · long.wav')).toBeVisible({ timeout: 160000 });
  const position = page.getByLabel('Recording position');
  await expect(position).toBeVisible();
  const max = await position.getAttribute('max');
  await position.fill(max!);
  await expect(page.getByRole('img', { name: /^Live spectrogram/ })).toHaveAttribute('data-end-sample', String(121 * 48000));
});
