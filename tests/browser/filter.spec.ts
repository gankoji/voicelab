import { expect, test } from '@playwright/test';
import { encodeWav } from '../../src/export/export';

test('filters the selected interval and exports the altered audio', async ({ page }) => {
  const rate = 48000;
  const samples = Float32Array.from({ length: rate }, (_, i) =>
    0.3 * Math.sin(2 * Math.PI * 250 * i / rate) + 0.3 * Math.sin(2 * Math.PI * 1500 * i / rate));
  await page.goto('/');
  await page.getByLabel('Choose audio file').setInputFiles({
    name: 'two-tones.wav', mimeType: 'audio/wav', buffer: Buffer.from(encodeWav(samples, rate)),
  });
  await expect(page.getByText('Imported · two-tones.wav')).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Start (seconds)').fill('0.1');
  await page.getByLabel('End (seconds)').fill('0.9');
  await page.getByRole('button', { name: 'Set selection' }).click();
  await page.getByText('Playback and editing', { exact: true }).click();
  await page.getByLabel('Low frequency (Hz)').fill('180');
  await page.getByLabel('High frequency (Hz)').fill('350');
  await page.getByRole('button', { name: 'Set frequency band' }).click();
  await page.getByRole('button', { name: 'Keep band' }).click();
  await expect(page.getByText(/Edit complete/)).toBeVisible({ timeout: 30000 });
  const download = page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.wav') });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const wav = Buffer.concat(chunks);
  const amplitude = (frequency: number, first: number, last: number) => {
    let sine = 0, cosine = 0;
    for (let n = first; n < last; n++) {
      const value = wav.readInt16LE(44 + 2 * n) / 32768;
      sine += value * Math.sin(2 * Math.PI * frequency * n / rate);
      cosine += value * Math.cos(2 * Math.PI * frequency * n / rate);
    }
    return 2 * Math.hypot(sine, cosine) / (last - first);
  };
  expect(amplitude(250, 12000, 36000)).toBeGreaterThan(0.1);
  expect(amplitude(1500, 12000, 36000)).toBeLessThan(0.05);
  expect(amplitude(1500, 0, 4800)).toBeGreaterThan(0.25);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(page.getByText('Previous version restored.')).toBeVisible();
});
