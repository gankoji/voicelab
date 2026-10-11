import { describe, expect, it } from 'vitest';
import { LiveAnalysis } from './live-analysis';
import { DEFAULT_VIEW, frequencyAt, frequencyFraction, normalizeView } from './view';
import { SpectralHistory } from '../buffers/spectral-history';

describe('live visualization frames', () => {
  it('aligns both views to a shared delayed sample range and retains waveform peaks', () => {
    const analysis = new LiveAnalysis(48000);
    const input = new Float32Array(4096);
    input[2000] = 0.8;
    analysis.append(input, 0);
    const frame = analysis.render({ ...DEFAULT_VIEW, historySeconds: 0.1 }, 100);
    expect(frame.endSample).toBe(3072);
    expect(frame.startSample).toBe(3072 - 4800);
    expect(Math.max(...frame.maximum.filter(Number.isFinite))).toBeCloseTo(0.8);
    expect(frame.minimum[0]).toBeNaN(); // Before capture, not fabricated silence.
    expect(frame.spectrum.some((level) => level > 1)).toBe(true);
  });

  it('returns individual samples at fine zoom and centered linear RMS', () => {
    const analysis = new LiveAnalysis(48000);
    analysis.append(new Float32Array(8192).fill(0.25), 0);
    const frame = analysis.render({ ...DEFAULT_VIEW, historySeconds: 0.005, showRms: true }, 500);
    expect(frame.trace).toHaveLength(240);
    expect(frame.trace.every((value) => value === 0.25)).toBe(true);
    expect(frame.rms.every((value) => value === 0.25)).toBe(true);
  });

  it('clears incompatible spectra after a preset change but keeps raw history', () => {
    const analysis = new LiveAnalysis(48000);
    analysis.append(new Float32Array(8192).fill(0.5), 0);
    const next = analysis.render({ ...DEFAULT_VIEW, fftSize: 4096 }, 100);
    expect(next.spectrum.every((value) => value === 0)).toBe(true);
    expect(next.maximum.some((value) => value === 0.5)).toBe(true);
    analysis.append(new Float32Array(4096).fill(0.5), 8192);
    expect(analysis.render({ ...DEFAULT_VIEW, fftSize: 4096 }, 100).spectrum.some((value) => value > 0)).toBe(true);
  });

  it('renders silence differently from missing spectral windows and evicts old frames', () => {
    const history = new SpectralHistory(2, 1024, 256);
    const settings = { ...DEFAULT_VIEW, minFrequency: 20, maxFrequency: 1000 };
    history.append(new Float32Array(513).fill(-Infinity), 512);
    history.append(new Float32Array(513).fill(-Infinity), 768);
    history.append(new Float32Array(513).fill(-Infinity), 1536);
    const raster = history.rasterize(0, 2048, 16, 1, 48000, settings);
    expect(raster[4]).toBe(0); // Evicted center=512, no stale spectrum.
    expect(raster[6]).toBe(1); // Center=768, measured silence.
    expect(raster[9]).toBe(0); // Gap.
    expect(raster[12]).toBe(1);
  });

  it('clamps frequency to Nyquist and round-trips linear/log coordinates', () => {
    const clamped = normalizeView({ ...DEFAULT_VIEW, historySeconds: 500, maxFrequency: 20000 }, 8000);
    expect(clamped.historySeconds).toBe(30);
    expect(clamped.maxFrequency).toBe(4000);
    for (const frequencyScale of ['linear', 'log'] as const) {
      const settings = { ...DEFAULT_VIEW, frequencyScale };
      for (const fraction of [0, 0.1, 0.5, 1]) {
        expect(frequencyFraction(frequencyAt(fraction, settings), settings)).toBeCloseTo(fraction, 10);
      }
    }
  });
});
