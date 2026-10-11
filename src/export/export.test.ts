import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW } from '../analysis/view';
import { buildMetadata, encodeWav } from './export';

function parseWav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const ascii = (offset: number, length: number) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    audioFormat: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    data: ascii(36, 4),
    dataBytes: view.getUint32(40, true),
    sampleAt: (i: number) => view.getInt16(44 + i * 2, true),
  };
}

describe('WAV encoding', () => {
  it('writes a valid mono PCM16 header and round-trips samples', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = parseWav(encodeWav(samples, 48000));
    expect(wav).toMatchObject({
      riff: 'RIFF', wave: 'WAVE', fmt: 'fmt ', audioFormat: 1, channels: 1,
      sampleRate: 48000, bitsPerSample: 16, data: 'data', dataBytes: 10,
    });
    expect(wav.sampleAt(0)).toBe(0);
    expect(wav.sampleAt(1)).toBeCloseTo(Math.round(0.5 * 32767), 0);
    expect(wav.sampleAt(2)).toBeCloseTo(Math.round(-0.5 * 32767), 0);
    expect(wav.sampleAt(3)).toBe(32767);
    expect(wav.sampleAt(4)).toBe(-32767);
  });

  it('clips out-of-range values and zeroes NaN gaps', () => {
    const samples = new Float32Array([2, -2, NaN]);
    const wav = parseWav(encodeWav(samples, 48000));
    expect(wav.sampleAt(0)).toBe(32767);
    expect(wav.sampleAt(1)).toBe(-32767);
    expect(wav.sampleAt(2)).toBe(0);
  });
});

describe('export metadata', () => {
  it('records the time-aligned interval and analysis settings', () => {
    const metadata = buildMetadata({
      app: 'voice-lab', version: '0.1.0', exportedAt: '2025-01-01T00:00:00.000Z',
      sampleRate: 48000, startSample: 4800, endSample: 14400, sampleCount: 9600,
      settings: DEFAULT_VIEW,
    });
    expect(metadata.range).toEqual({
      startSample: 4800, endSample: 14400, startSeconds: 0.1, endSeconds: 0.3, durationSeconds: 0.2,
    });
    expect(metadata.settings).toEqual(DEFAULT_VIEW);
    expect(metadata.pitch).toEqual([]);
    expect(metadata.formants).toEqual([]);
    expect(metadata.format).toMatchObject({ encoding: 'PCM16', channels: 1, byteOrder: 'little-endian' });
  });

  it('records pitch points with snapshot-relative time', () => {
    const metadata = buildMetadata({
      app: 'voice-lab', version: '0.1.0', exportedAt: '2025-01-01T00:00:00.000Z',
      sampleRate: 48000, startSample: 0, endSample: 9600, sampleCount: 9600,
      settings: DEFAULT_VIEW,
      pitch: [
        { sampleIndex: 2400, f0Hz: 220, confidence: 0.9, voiced: true },
        { sampleIndex: 4800, f0Hz: 0, confidence: 0, voiced: false },
      ],
    });
    expect(metadata.pitch).toEqual([
      { timeSeconds: 0.05, f0Hz: 220, confidence: 0.9, voiced: true },
      { timeSeconds: 0.1, f0Hz: 0, confidence: 0, voiced: false },
    ]);
  });

  it('records formant points with nullable F1–F3', () => {
    const metadata = buildMetadata({
      app: 'voice-lab', version: '0.1.0', exportedAt: '2025-01-01T00:00:00.000Z',
      sampleRate: 48000, startSample: 0, endSample: 9600, sampleCount: 9600,
      settings: DEFAULT_VIEW,
      formants: [
        { sampleIndex: 2400, formants: [700, 1220, 2400], confidence: 0.8 },
        { sampleIndex: 4800, formants: [720, 1250], confidence: 0.7 },
      ],
    });
    expect(metadata.formants).toEqual([
      { timeSeconds: 0.05, f1Hz: 700, f2Hz: 1220, f3Hz: 2400, confidence: 0.8 },
      { timeSeconds: 0.1, f1Hz: 720, f2Hz: 1250, f3Hz: null, confidence: 0.7 },
    ]);
  });
});
