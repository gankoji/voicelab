import { describe, expect, it } from 'vitest';
import { estimatePitchMcLeod } from './mcleod';

const SAMPLE_RATE = 48000;

function sine(f0: number, length = 2048, amplitude = 0.5) {
  return Float32Array.from({ length }, (_, n) => amplitude * Math.sin(2 * Math.PI * f0 * n / SAMPLE_RATE));
}

describe('McLeod pitch estimation', () => {
  it.each([100, 200, 440, 1000])('tracks a %i Hz pure tone', (f0) => {
    const estimate = estimatePitchMcLeod(sine(f0), { sampleRate: SAMPLE_RATE });
    expect(estimate).not.toBeNull();
    expect(Math.abs(estimate!.f0Hz - f0)).toBeLessThan(Math.max(2, f0 * 0.02));
  });

  it('returns null for silence', () => {
    expect(estimatePitchMcLeod(new Float32Array(2048), { sampleRate: SAMPLE_RATE })).toBeNull();
  });
});
