import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

// Real-browser soak: records synthetic audio for N seconds, samples the JS heap,
// and verifies the page stays live with bounded dropped samples. It is not a
// substitute for a physical-device 30-minute run or end-to-end latency measurement.
const seconds = Number(process.argv[2] ?? '60');
const sampleRate = 48000;

function writeFixture(path) {
  const frames = sampleRate * 2;
  const bytes = frames * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(bytes, 40);
  for (let n = 0; n < frames; n++) {
    wav.writeInt16LE(Math.round(0.25 * 32767 * Math.sin(2 * Math.PI * 440 * n / sampleRate)), 44 + n * 2);
  }
  writeFileSync(path, wav);
}

const fixture = join(tmpdir(), 'voice-lab-soak.wav');
writeFixture(fixture);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '0', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });

let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview did not start')), 15000);
    server.stdout.on('data', (data) => {
      const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Preview exited')); });
    server.stderr.on('data', (data) => process.stderr.write(data));
  });

  browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fixture}`],
  });
  const page = await browser.newPage({ permissions: ['microphone'] });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByRole('status', { name: 'Capture status' }).waitFor({ state: 'visible' });

  const cdp = await page.context().newCDPSession(page);
  const heap = async () => cdp.send('Runtime.getHeapUsage');
  const heapSamples = [];
  const start = Date.now();
  const deadline = start + seconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const usage = await heap();
    heapSamples.push({ t: Math.round((Date.now() - start) / 1000), heapUsed: usage.usedSize, heapTotal: usage.totalSize });
    if (!(await page.getByRole('status', { name: 'Capture status' }).innerText()).includes('Live')) {
      throw new Error('Capture was not live during the soak');
    }
  }

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Capture details and processing', { exact: true }).click();
  const processed = Number(await page.getByLabel('Processed samples').innerText());
  const dropped = Number(await page.getByLabel('Dropped samples').innerText());

  const used = heapSamples.map((sample) => sample.heapUsed);
  console.log(JSON.stringify({
    seconds: Math.round((Date.now() - start) / 1000),
    pageErrors,
    processedSamples: processed,
    droppedSamples: dropped,
    heapSamples,
    heapUsed: { start: used[0], max: Math.max(...used), end: used.at(-1) },
  }, null, 2));

  if (pageErrors.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
