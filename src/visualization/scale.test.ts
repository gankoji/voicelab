import { describe, expect, it } from 'vitest';
import type { PlotFrame } from '../analysis/view';
import { DEFAULT_VIEW } from '../analysis/view';
import { computeWaveformScale, WAVEFORM_MAX_GAIN } from './scale';

function frame(minimum: Float32Array<ArrayBuffer>, maximum: Float32Array<ArrayBuffer>, trace = new Float32Array(0)): PlotFrame {
  return {
    sampleRate: 48000, startSample: 0, endSample: 48000,
    settings: { ...DEFAULT_VIEW }, width: minimum.length, rows: 1,
    spectrum: new Uint8Array(minimum.length),
    minimum, maximum, rms: new Float32Array(minimum.length),
    trace, traceFirstSample: 0,
    referenceEndSample: 0,
  };
}

describe('waveform auto-gain', () => {
  it('keeps the fixed full-scale axis when auto-gain is off', () => {
    const f = frame(new Float32Array([-0.01]), new Float32Array([0.01]));
    expect(computeWaveformScale(f, false)).toEqual({ gain: 1, maxAmplitude: 1 });
  });

  it('amplifies a quiet signal toward the target peak', () => {
    const f = frame(new Float32Array([-0.02]), new Float32Array([0.02]));
    const scale = computeWaveformScale(f, true);
    expect(scale.gain).toBeCloseTo(45, 3);
    expect(scale.maxAmplitude).toBeCloseTo(1 / 45, 3);
  });

  it('does not attenuate loud signals and caps silence amplification', () => {
    const loud = frame(new Float32Array([-1]), new Float32Array([1]));
    expect(computeWaveformScale(loud, true)).toEqual({ gain: 1, maxAmplitude: 1 });
    const silent = frame(new Float32Array([-1e-6]), new Float32Array([1e-6]));
    expect(computeWaveformScale(silent, true)).toEqual({ gain: 1, maxAmplitude: 1 });
    const tiny = frame(new Float32Array([-0.005]), new Float32Array([0.005]));
    expect(computeWaveformScale(tiny, true).gain).toBe(WAVEFORM_MAX_GAIN);
  });

  it('uses the trace at fine zoom and ignores missing columns at overview', () => {
    const trace = new Float32Array([0, 0, 0.3, 0, 0]);
    const f = frame(new Float32Array(5), new Float32Array(5).fill(NaN), trace);
    expect(computeWaveformScale(f, true).maxAmplitude).toBeCloseTo(1 / 3, 3);
  });
});
