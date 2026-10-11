import { describe, expect, it } from 'vitest';
import { FormantHistory, FormantSmoother, FormantTracker } from './formant-tracker';
import type { FormantPoint } from './formants';

const SAMPLE_RATE = 48000;

function convolve(p: number[], q: number[]): number[] {
  const out = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) out[i + j] += p[i]! * q[j]!;
  return out;
}

function synthesizeVowel(formants: { f: number; bw: number }[], f0: number, length: number): Float32Array {
  let a = [1];
  for (const { f, bw } of formants) {
    const r = Math.exp(-Math.PI * bw / SAMPLE_RATE);
    const theta = 2 * Math.PI * f / SAMPLE_RATE;
    a = convolve(a, [1, -2 * r * Math.cos(theta), r * r]);
  }
  const impulse = new Float64Array(length);
  impulse[0] = 1;
  for (let n = 1; n < length; n++) {
    let acc = 0;
    for (let k = 1; k < a.length && k <= n; k++) acc += a[k]! * impulse[n - k]!;
    impulse[n] = -acc;
  }
  const period = Math.round(SAMPLE_RATE / f0);
  const out = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    let acc = 0;
    for (let k = 0; k * period <= n; k++) acc += impulse[n - k * period]!;
    out[n] = acc;
  }
  return out;
}

describe('FormantTracker', () => {
  it('emits F1–F3 for a voiced vowel stream', () => {
    const signal = synthesizeVowel(
      [{ f: 700, bw: 90 }, { f: 1220, bw: 90 }, { f: 2400, bw: 150 }], 120, SAMPLE_RATE,
    );
    const points: FormantPoint[] = [];
    const tracker = new FormantTracker((point) => points.push(point), () => true, {
      sampleRate: SAMPLE_RATE, windowSize: 2400, hop: 1024, order: 12,
    });
    tracker.ingest(signal.subarray(0, 997), 0);
    tracker.ingest(signal.subarray(997, 2041), 997);
    tracker.ingest(signal.subarray(2041), 2041);

    const voiced = points.filter((point) => point.formants.length >= 3);
    expect(voiced.length).toBeGreaterThan(0);
    const first = voiced[0]!;
    expect(Math.abs(first.formants[0]! - 700)).toBeLessThan(60);
    expect(Math.abs(first.formants[1]! - 1220)).toBeLessThan(80);
    expect(Math.abs(first.formants[2]! - 2400)).toBeLessThan(150);
    for (let i = 1; i < points.length; i++) expect(points[i]!.sampleIndex).toBeGreaterThan(points[i - 1]!.sampleIndex);
  });

  it('emits empty points for unvoiced audio', () => {
    const points: FormantPoint[] = [];
    const tracker = new FormantTracker((point) => points.push(point), () => false, { sampleRate: SAMPLE_RATE });
    tracker.ingest(new Float32Array(SAMPLE_RATE), 0);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => point.formants.every((f) => !Number.isFinite(f)))).toBe(true);
  });
});

describe('FormantSmoother', () => {
  it('smooths a candidate jump instead of snapping, and holds through brief gaps', () => {
    const smoother = new FormantSmoother();
    expect(smoother.update([700, 1220, 2400])).toEqual([700, 1220, 2400]);

    const jumped = smoother.update([900, 1220, 2400]);
    expect(jumped[0]).toBeCloseTo(760, 6); // 0.3 of the way, not a full snap
    expect(jumped[1]).toBeCloseTo(1220, 6);
    expect(jumped[2]).toBeCloseTo(2400, 6);

    const onlyF2F3 = [1220, 2400];
    for (let i = 0; i < 3; i++) smoother.update(onlyF2F3);
    expect(Number.isFinite(smoother.update(onlyF2F3)[0])).toBe(false); // gaps after the hold
  });
});

describe('FormantHistory', () => {
  it('returns points in a sample range, oldest first', () => {
    const history = new FormantHistory(8);
    history.push({ sampleIndex: 100, formants: [1], confidence: 1 });
    history.push({ sampleIndex: 200, formants: [2], confidence: 1 });
    history.push({ sampleIndex: 300, formants: [3], confidence: 1 });
    expect(history.range(150, 350).map((point) => point.sampleIndex)).toEqual([200, 300]);
  });
});
