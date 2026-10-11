import { describe, expect, it } from 'vitest';
import { PitchHistory } from './pitch-history';
import { PitchTracker } from './pitch-tracker';
import type { PitchPoint } from './pitch';

const SAMPLE_RATE = 48000;

function tone(f0: number, length: number) {
  return Float32Array.from({ length }, (_, n) => 0.5 * Math.sin(2 * Math.PI * f0 * n / SAMPLE_RATE));
}

function point(sampleIndex: number, voiced = true): PitchPoint {
  return { sampleIndex, f0Hz: voiced ? 220 : 0, confidence: voiced ? 0.9 : 0, voiced };
}

describe('PitchTracker', () => {
  it('emits voiced estimates at hop spacing across arbitrary chunks', () => {
    const signal = tone(440, SAMPLE_RATE);
    const points: PitchPoint[] = [];
    const tracker = new PitchTracker((est) => points.push(est), { sampleRate: SAMPLE_RATE, windowSize: 2048, hop: 512 });
    tracker.ingest(signal.subarray(0, 97), 0);
    tracker.ingest(signal.subarray(97, 511), 97);
    tracker.ingest(signal.subarray(511), 511);

    const voiced = points.filter((est) => est.voiced);
    expect(voiced.length).toBeGreaterThan(3);
    for (const est of voiced) expect(Math.abs(est.f0Hz - 440)).toBeLessThan(2);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.sampleIndex).toBeGreaterThan(points[i - 1]!.sampleIndex);
    }
  });

  it('marks silence unvoiced', () => {
    const points: PitchPoint[] = [];
    const tracker = new PitchTracker((est) => points.push(est), { sampleRate: SAMPLE_RATE });
    tracker.ingest(new Float32Array(SAMPLE_RATE), 0);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((est) => !est.voiced)).toBe(true);
  });

  it('resets across a discontinuity instead of bridging the gap', () => {
    const points: PitchPoint[] = [];
    const tracker = new PitchTracker((est) => points.push(est), { sampleRate: SAMPLE_RATE, windowSize: 1024, hop: 256 });
    tracker.ingest(tone(220, 4096), 0);
    tracker.ingest(tone(440, 4096), 100000);

    const before = points.filter((est) => est.voiced && est.sampleIndex < 4000);
    const after = points.filter((est) => est.voiced && est.sampleIndex >= 100000);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const est of before) expect(Math.abs(est.f0Hz - 220)).toBeLessThan(3);
    for (const est of after) expect(Math.abs(est.f0Hz - 440)).toBeLessThan(3);
    // No voiced estimate should blend the two frequencies across the gap.
    expect(points.filter((est) => est.voiced && est.f0Hz > 300 && est.f0Hz < 360)).toHaveLength(0);
  });
});

describe('PitchHistory', () => {
  it('returns points in a sample range, oldest first', () => {
    const history = new PitchHistory(8);
    history.push(point(100));
    history.push(point(200));
    history.push(point(300));
    expect(history.range(150, 350).map((est) => est.sampleIndex)).toEqual([200, 300]);
    expect(history.range(0, 50)).toEqual([]);
  });

  it('wraps and evicts the oldest points without reordering', () => {
    const history = new PitchHistory(3);
    history.push(point(100));
    history.push(point(200));
    history.push(point(300));
    history.push(point(400)); // 100 evicted
    expect(history.range(0, 1000).map((est) => est.sampleIndex)).toEqual([200, 300, 400]);
  });
});
