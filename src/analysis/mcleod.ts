import type { PitchEstimate, PitchOptions } from './pitch';
import { PITCH_DEFAULT_MIN_FREQUENCY, PITCH_DEFAULT_MAX_FREQUENCY } from './pitch';

/**
 * McLeod Pitch Method (MPM): normalized square-difference function with a
 * clarity threshold, taking the first local maximum above it as the period.
 */
export function estimatePitchMcLeod(samples: Float32Array, options: PitchOptions): PitchEstimate | null {
  const { sampleRate } = options;
  const minFrequency = options.minFrequency ?? PITCH_DEFAULT_MIN_FREQUENCY;
  const maxFrequency = options.maxFrequency ?? Math.min(PITCH_DEFAULT_MAX_FREQUENCY, sampleRate / 2);
  const threshold = options.threshold ?? 0.9;

  const n = samples.length;
  if (n < 2) return null;

  const tauMax = Math.min(n - 1, Math.floor(sampleRate / minFrequency));
  const tauMin = Math.max(2, Math.ceil(sampleRate / maxFrequency));
  if (tauMax < tauMin) return null;

  const nsdf = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let cross = 0;
    let energy = 0;
    for (let i = 0; i < n - tau; i++) {
      const a = samples[i]!;
      const b = samples[i + tau]!;
      cross += a * b;
      energy += a * a + b * b;
    }
    nsdf[tau] = energy > 0 ? 2 * cross / energy : 0;
  }

  let peakTau = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    const value = nsdf[tau]!;
    if (value >= threshold && value > nsdf[tau - 1]! && value >= nsdf[tau + 1]!) {
      peakTau = tau;
      break;
    }
  }
  if (peakTau < 0) return null;

  let refinedTau = peakTau;
  if (peakTau > tauMin && peakTau < tauMax) {
    const y0 = nsdf[peakTau - 1]!;
    const y1 = nsdf[peakTau]!;
    const y2 = nsdf[peakTau + 1]!;
    const denominator = 2 * (2 * y1 - y2 - y0);
    if (denominator !== 0) {
      const shift = (y2 - y0) / denominator;
      if (Math.abs(shift) < 1) refinedTau = peakTau + shift;
    }
  }

  const f0Hz = sampleRate / refinedTau;
  if (f0Hz < minFrequency || f0Hz > maxFrequency) return null;
  const confidence = Math.min(1, Math.max(0, nsdf[peakTau]!));
  return { f0Hz, confidence };
}
