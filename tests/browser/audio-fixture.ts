import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const fixturePath = resolve('node_modules/.cache/voice-lab-tests/microphone.wav');

/** Reproducible 440 Hz, quarter-scale mono PCM16; no personal audio recordings. */
export default async function createAudioFixture() {
  const sampleRate = 48000;
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
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, wav);
}
