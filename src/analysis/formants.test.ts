import { describe, expect, it } from 'vitest';
import { estimateFormants } from './formants';

const SAMPLE_RATE = 48000;

function convolvePolynomials(p: number[], q: number[]): number[] {
  const out = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) out[i + j] += p[i]! * q[j]!;
  }
  return out;
}

function synthesizeVowel(formants: { f: number; bw: number }[], f0: number, length: number): Float32Array {
  let a = [1];
  for (const { f, bw } of formants) {
    const r = Math.exp(-Math.PI * bw / SAMPLE_RATE);
    const theta = 2 * Math.PI * f / SAMPLE_RATE;
    a = convolvePolynomials(a, [1, -2 * r * Math.cos(theta), r * r]);
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

function expectNear(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

describe('formant estimation', () => {
  it('recovers F1–F3 of a synthesized vowel', () => {
    const signal = synthesizeVowel(
      [{ f: 700, bw: 90 }, { f: 1220, bw: 90 }, { f: 2400, bw: 150 }],
      120,
      SAMPLE_RATE,
    );
    const estimate = estimateFormants(signal.subarray(4800), { sampleRate: SAMPLE_RATE, order: 12, windowSize: 2400 });
    expect(estimate).not.toBeNull();
    expect(estimate!.formants.length).toBeGreaterThanOrEqual(3);
    expectNear(estimate!.formants[0]!, 700, 60);
    expectNear(estimate!.formants[1]!, 1220, 80);
    expectNear(estimate!.formants[2]!, 2400, 150);
    expect(estimate!.confidence).toBeGreaterThan(0.5);
  });

  it('returns null for silence', () => {
    expect(estimateFormants(new Float32Array(2400), { sampleRate: SAMPLE_RATE })).toBeNull();
  });

  it('returns fewer than three formants when the filter has fewer resonances', () => {
    const signal = synthesizeVowel([{ f: 700, bw: 100 }], 120, SAMPLE_RATE);
    const estimate = estimateFormants(signal.subarray(4800), { sampleRate: SAMPLE_RATE, order: 12, windowSize: 2400 });
    expect(estimate).not.toBeNull();
    expect(estimate!.formants.length).toBeLessThan(3);
    expectNear(estimate!.formants[0]!, 700, 60);
  });
});
