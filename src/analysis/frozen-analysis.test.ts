import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW } from './view';
import { clampFrozenRange, FrozenAnalysis } from './frozen-analysis';

const sampleRate = 48000;

function tone(length: number, amplitude = 0.25) {
  return Float32Array.from({ length }, (_, n) => amplitude * Math.sin(2 * Math.PI * 440 * n / sampleRate));
}

describe('frozen re-analysis', () => {
  const samples = tone(sampleRate * 2);

  it('renders an explicit sub-range and preserves waveform min/max', () => {
    const analysis = new FrozenAnalysis(sampleRate, samples, 2048);
    const frame = analysis.renderRange(48000, 90000, DEFAULT_VIEW, 100);
    expect(frame.startSample).toBe(48000);
    expect(frame.endSample).toBe(90000);
    expect(frame.maximum.every((value) => Number.isFinite(value))).toBe(true);
    expect(Math.max(...frame.maximum)).toBeCloseTo(0.25, 2);
  });

  it('clamps out-of-range requests and aligns the display end to whole analysis windows', () => {
    const analysis = new FrozenAnalysis(sampleRate, samples, 2048);
    expect(analysis.endSample).toBe(samples.length);
    expect(analysis.displayEnd).toBe(samples.length - 1024);
    const frame = analysis.renderRange(-100, samples.length + 500, DEFAULT_VIEW, 50);
    expect(frame.startSample).toBe(0);
    expect(frame.endSample).toBe(samples.length - 1024);
  });

  it('re-analyzes after an FFT-size change', () => {
    const analysis = new FrozenAnalysis(sampleRate, samples, 2048);
    const frame = analysis.renderRange(0, analysis.displayEnd, { ...DEFAULT_VIEW, fftSize: 4096 }, 100);
    expect(frame.settings.fftSize).toBe(4096);
    expect(Math.max(...frame.maximum)).toBeCloseTo(0.25, 2);
  });

  it('returns individual samples at fine zoom over a sub-range', () => {
    const analysis = new FrozenAnalysis(sampleRate, samples, 2048);
    const frame = analysis.renderRange(1000, 1500, DEFAULT_VIEW, 500);
    expect(frame.trace).toHaveLength(500);
  });

  it('slices an explicit interval for export', () => {
    const analysis = new FrozenAnalysis(sampleRate, samples, 2048);
    const slice = analysis.slice(480, 960);
    expect(slice).toHaveLength(480);
    expect(slice[0]).toBeCloseTo(0.25 * Math.sin(2 * Math.PI * 440 * 480 / sampleRate), 4);
    expect(analysis.slice(100, 100)).toHaveLength(0);
  });

  it('serves snapshot-local pitch points for a range', () => {
    const analysis = new FrozenAnalysis(sampleRate, samples, 2048, [
      { sampleIndex: 100, f0Hz: 200, confidence: 0.9, voiced: true },
      { sampleIndex: 500, f0Hz: 0, confidence: 0, voiced: false },
    ]);
    expect(analysis.pitchRange(0, 400).map((point) => point.sampleIndex)).toEqual([100]);
    expect(analysis.pitchRange(0, 1000)).toHaveLength(2);
  });
});

describe('frozen range clamping', () => {
  const analysis = new FrozenAnalysis(sampleRate, tone(sampleRate), 1024);

  it('keeps the range within the retained history with a minimum duration', () => {
    expect(analysis.displayEnd).toBe(sampleRate - 512);
    const { start, end } = clampFrozenRange(analysis, 0, analysis.displayEnd);
    expect(start).toBe(0);
    expect(end).toBe(analysis.displayEnd);
    expect(clampFrozenRange(analysis, -5000, 1000)).toEqual({ start: 0, end: 6000 });
    expect(clampFrozenRange(analysis, analysis.displayEnd - 10, analysis.displayEnd + 5000).end).toBe(analysis.displayEnd);
  });

  it('collapses a degenerate range to the minimum duration', () => {
    const { start, end } = clampFrozenRange(analysis, 500, 500);
    expect(end - start).toBeGreaterThanOrEqual(64);
    expect(end).toBeLessThanOrEqual(analysis.displayEnd);
  });
});
