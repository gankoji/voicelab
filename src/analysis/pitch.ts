export interface PitchEstimate {
  f0Hz: number;
  /** 0..1 periodicity; higher means a stronger, clearer period. */
  confidence: number;
}

export interface PitchPoint {
  /** Center sample of the analysis window within the stream. */
  sampleIndex: number;
  f0Hz: number;
  confidence: number;
  voiced: boolean;
}

export interface PitchOptions {
  sampleRate: number;
  minFrequency?: number;
  maxFrequency?: number;
  threshold?: number;
}

export const PITCH_DEFAULT_MIN_FREQUENCY = 40;
export const PITCH_DEFAULT_MAX_FREQUENCY = 1500;
export const PITCH_VOICING_CONFIDENCE = 0.5;

/**
 * YIN pitch estimation over a single window. Returns null when no period is
 * found below the absolute threshold (silence, noise, or out of range).
 */
export function estimatePitchYin(samples: Float32Array, options: PitchOptions): PitchEstimate | null {
  const { sampleRate } = options;
  const minFrequency = options.minFrequency ?? PITCH_DEFAULT_MIN_FREQUENCY;
  const maxFrequency = options.maxFrequency ?? Math.min(PITCH_DEFAULT_MAX_FREQUENCY, sampleRate / 2);
  const threshold = options.threshold ?? 0.15;

  const n = samples.length;
  if (n < 2) return null;

  const tauMax = Math.min(n - 1, Math.floor(sampleRate / minFrequency));
  const tauMin = Math.max(2, Math.ceil(sampleRate / maxFrequency));
  if (tauMax < tauMin) return null;

  // Difference function d(tau) = sum (x[i] - x[i+tau])^2.
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tau; i++) {
      const diff = samples[i]! - samples[i + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative-mean-normalized difference.
  const cmndf = new Float64Array(tauMax + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += d[tau]!;
    cmndf[tau] = runningSum > 0 ? d[tau]! * tau / runningSum : 1;
  }

  // Absolute threshold finds the first valley; then walk that valley to its
  // actual minimum, since the first crossing falls on the valley's shoulder.
  let firstCrossing = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmndf[tau]! < threshold) {
      firstCrossing = tau;
      break;
    }
  }
  if (firstCrossing < 0) return null;

  let bestTau = firstCrossing;
  let bestValue = cmndf[firstCrossing]!;
  for (let tau = firstCrossing + 1; tau <= tauMax && cmndf[tau]! < threshold; tau++) {
    if (cmndf[tau]! < bestValue) {
      bestValue = cmndf[tau]!;
      bestTau = tau;
    }
  }

  let refinedTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax) {
    const s0 = cmndf[bestTau - 1]!;
    const s1 = cmndf[bestTau]!;
    const s2 = cmndf[bestTau + 1]!;
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (denominator !== 0) {
      const shift = (s2 - s0) / denominator;
      if (Math.abs(shift) < 1) refinedTau = bestTau + shift;
    }
  }

  const f0Hz = sampleRate / refinedTau;
  if (f0Hz < minFrequency || f0Hz > maxFrequency) return null;

  const confidence = Math.min(1, Math.max(0, 1 - bestValue));
  return { f0Hz, confidence };
}
