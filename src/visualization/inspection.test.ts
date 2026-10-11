import { describe, expect, it } from 'vitest';
import type { PlotFrame } from '../analysis/view';
import { DEFAULT_VIEW } from '../analysis/view';
import { inspectSpectrum, inspectWaveform } from './inspection';

function frame(overrides: Partial<PlotFrame> = {}): PlotFrame {
  return {
    sampleRate: 48000,
    startSample: -480000,
    endSample: 0,
    settings: { ...DEFAULT_VIEW, historySeconds: 10 },
    width: 100,
    rows: 10,
    spectrum: new Uint8Array(100 * 10),
    minimum: new Float32Array(100).fill(-0.1),
    maximum: new Float32Array(100).fill(0.1),
    rms: new Float32Array(100),
    trace: new Float32Array(0),
    traceFirstSample: 0,
    referenceEndSample: 0,
    ...overrides,
  };
}

describe('frozen-frame inspection', () => {
  it('maps time so the left edge is oldest and the right edge is the displayed end', () => {
    const f = frame();
    expect(inspectSpectrum(f, 0, 0.5).timeSeconds).toBeCloseTo(-10, 6);
    expect(inspectSpectrum(f, 1, 0.5).timeSeconds).toBeCloseTo(0, 6);
    expect(inspectSpectrum(f, 0.5, 0.5).timeSeconds).toBeCloseTo(-5, 6);
  });

  it('converts y to frequency at both ends of a linear scale', () => {
    const f = frame();
    expect(inspectSpectrum(f, 0.5, 0).frequency).toBeCloseTo(10000, 6);
    expect(inspectSpectrum(f, 0.5, 1).frequency).toBeCloseTo(50, 6);
  });

  it('reconstructs approximate dB from the color raster and reports gaps', () => {
    const f = frame({
      rows: 1, width: 1, spectrum: new Uint8Array(1),
      settings: { ...DEFAULT_VIEW, floorDb: -90, ceilingDb: 0 },
    });
    f.spectrum[0] = 255;
    expect(inspectSpectrum(f, 0, 0.5).levelDb).toBeCloseTo(0, 1);
    f.spectrum[0] = 1;
    expect(inspectSpectrum(f, 0, 0.5).levelDb).toBeCloseTo(-90, 1);
    f.spectrum[0] = 0;
    expect(inspectSpectrum(f, 0, 0.5).levelDb).toBeNull();
  });

  it('surfaces waveform min/max for the hovered column and nulls missing data', () => {
    const f = frame();
    const whole = inspectWaveform(f, 0.5);
    expect(whole.minimum).toBeCloseTo(-0.1, 4);
    expect(whole.maximum).toBeCloseTo(0.1, 4);
    f.minimum[50] = NaN;
    f.maximum[50] = NaN;
    expect(inspectWaveform(f, 0.5)).toMatchObject({ minimum: null, maximum: null });
  });

  it('reports absolute time relative to the reference end when panned back', () => {
    const f = frame({ startSample: -960000, endSample: -480000, referenceEndSample: 0 });
    expect(inspectSpectrum(f, 1, 0.5).timeSeconds).toBeCloseTo(-10, 6);
    expect(inspectSpectrum(f, 0, 0.5).timeSeconds).toBeCloseTo(-20, 6);
  });
});
