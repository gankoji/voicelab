import { describe, expect, it } from 'vitest';
import { estimatePitchYin } from './pitch';

const SAMPLE_RATE = 48000;

function sine(f0: number, length = 2048, amplitude = 0.5) {
  return Float32Array.from({ length }, (_, n) => amplitude * Math.sin(2 * Math.PI * f0 * n / SAMPLE_RATE));
}

function harmonics(f0: number, amplitudes: number[], length = 2048) {
  return Float32Array.from({ length }, (_, n) => {
    let value = 0;
    amplitudes.forEach((amplitude, index) => {
      value += amplitude * Math.sin(2 * Math.PI * f0 * (index + 1) * n / SAMPLE_RATE);
    });
    return value;
  });
}

function noise(length = 2048) {
  let seed = 0x2f6e2b1;
  const random = () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return Float32Array.from({ length }, () => random() * 2 - 1);
}

function expectCloseHz(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(Math.max(2, expected * 0.02));
}

describe('YIN pitch estimation', () => {
  it.each([80, 100, 200, 440, 1000])('tracks a %i Hz pure tone', (f0) => {
    const estimate = estimatePitchYin(sine(f0), { sampleRate: SAMPLE_RATE });
    expect(estimate).not.toBeNull();
    expectCloseHz(estimate!.f0Hz, f0);
    expect(estimate!.confidence).toBeGreaterThan(0.8);
  });

  it('finds a missing fundamental in a harmonic series', () => {
    const estimate = estimatePitchYin(harmonics(100, [0.25, 0.25, 0.25, 0.25]), { sampleRate: SAMPLE_RATE });
    expect(estimate).not.toBeNull();
    expectCloseHz(estimate!.f0Hz, 100);
  });

  it('returns null for silence', () => {
    expect(estimatePitchYin(new Float32Array(2048), { sampleRate: SAMPLE_RATE })).toBeNull();
  });

  it('does not report a confident pitch for noise', () => {
    const estimate = estimatePitchYin(noise(), { sampleRate: SAMPLE_RATE });
    if (estimate) expect(estimate.confidence).toBeLessThan(0.5);
    else expect(estimate).toBeNull();
  });

  it('preserves the average pitch through vibrato', () => {
    const samples = new Float32Array(2048);
    let phase = 0;
    for (let n = 0; n < samples.length; n++) {
      const f0 = 440 + 20 * Math.sin(2 * Math.PI * 6 * n / SAMPLE_RATE);
      phase += 2 * Math.PI * f0 / SAMPLE_RATE;
      samples[n] = 0.5 * Math.sin(phase);
    }
    const estimate = estimatePitchYin(samples, { sampleRate: SAMPLE_RATE });
    expect(estimate).not.toBeNull();
    expect(estimate!.f0Hz).toBeGreaterThan(420);
    expect(estimate!.f0Hz).toBeLessThan(460);
  });

  it('respects a constrained pitch range', () => {
    expect(estimatePitchYin(sine(300), { sampleRate: SAMPLE_RATE, minFrequency: 400, maxFrequency: 1000 })).toBeNull();
    expect(estimatePitchYin(sine(500), { sampleRate: SAMPLE_RATE, minFrequency: 400, maxFrequency: 1000 })!.f0Hz).toBeCloseTo(500, 0);
  });
});
