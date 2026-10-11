import { describe, expect, it } from 'vitest';
import { amplitudeToDbfs, LevelAccumulator } from './levels';

describe('digital levels', () => {
  it('uses full-scale amplitude as its reference and handles silence', () => {
    expect(amplitudeToDbfs(1)).toBe(0);
    expect(amplitudeToDbfs(0.5)).toBeCloseTo(-6.0206, 4);
    expect(amplitudeToDbfs(0)).toBe(-Infinity);
    const levels = new LevelAccumulator(48000);
    expect(levels.read()).toBeNull();
    levels.add(new Float32Array(128), 0);
    expect(levels.read()).toMatchObject({ peakDbfs: -Infinity, rmsDbfs: -Infinity, nearClipping: false });
  });

  it.each([44100, 48000])('measures a quarter-scale sine at %i Hz', (sampleRate) => {
    const levels = new LevelAccumulator(sampleRate);
    const samples = Float32Array.from({ length: sampleRate }, (_, n) =>
      0.25 * Math.sin(2 * Math.PI * 440 * n / sampleRate),
    );
    // Unequal batches must be weighted by sample count, not averaged as dB.
    levels.add(samples.subarray(0, 103), 0);
    levels.add(samples.subarray(103), 103);
    const reading = levels.read()!;
    expect(reading.peakDbfs).toBeCloseTo(-12.0412, 3);
    expect(reading.rmsDbfs).toBeCloseTo(-15.0515, 3);
    expect(reading.receivedSamples).toBe(sampleRate);
    expect(reading.droppedSamples).toBe(0);
    expect(levels.read()).toBeNull();
  });

  it('resets interval levels while preserving counters and reporting gaps', () => {
    const levels = new LevelAccumulator(48000);
    levels.add(new Float32Array([0.5, -0.5]), 10);
    expect(levels.read()).toMatchObject({ receivedSamples: 2, droppedSamples: 10, endSample: 12 });
    levels.add(new Float32Array([0.25, -0.25]), 16);
    const reading = levels.read()!;
    expect(reading.peakDbfs).toBeCloseTo(-12.0412, 4);
    expect(reading.rmsDbfs).toBeCloseTo(-12.0412, 4);
    expect(reading).toMatchObject({ receivedSamples: 4, droppedSamples: 14, endSample: 18 });
  });

  it('holds the near-clipping warning for one second of the sample timeline', () => {
    const levels = new LevelAccumulator(1000);
    levels.add(new Float32Array([0.98]), 0);
    expect(levels.read()?.nearClipping).toBe(false);
    levels.add(new Float32Array([-0.99]), 1);
    expect(levels.read()?.nearClipping).toBe(true);
    levels.add(new Float32Array(500), 2);
    expect(levels.read()?.nearClipping).toBe(true);
    levels.add(new Float32Array(500), 502);
    expect(levels.read()?.nearClipping).toBe(false);
  });
});
