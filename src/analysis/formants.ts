import { autocorrelation, hammingWindow, levinsonDurbin } from './lpc';

export interface FormantOptions {
  sampleRate: number;
  /** LPC model order (number of poles), applied at the downsampled rate. */
  order?: number;
  /** Analysis frame length in original samples; default ~50 ms. */
  windowSize?: number;
  minFrequency?: number;
  maxFrequency?: number;
  /** First-difference pre-emphasis coefficient. */
  preEmphasis?: number;
  /** Envelope evaluation grid spacing in Hz. */
  gridHz?: number;
  /** Candidate peaks must exceed this fraction of the strongest envelope peak. */
  peakFloor?: number;
  /** Minimum frequency separation between reported formants in Hz. */
  minSpacing?: number;
}

export interface FormantEstimate {
  /** Ascending formant frequencies in Hz (at most three). */
  formants: number[];
  /** 0..1; higher is a better LR prediction. */
  confidence: number;
}

export interface FormantPoint {
  /** Center sample of the analysis window within the stream. */
  sampleIndex: number;
  formants: number[];
  confidence: number;
}

/** Boxcar-average then decimate; the low-pass keeps formants and drops aliasing. */
function lowpassDecimate(frame: Float32Array, factor: number): Float32Array {
  const length = Math.ceil(frame.length / factor);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    let count = 0;
    const base = i * factor;
    for (let j = 0; j < factor && base + j < frame.length; j++) {
      sum += frame[base + j]!;
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

/**
 * Estimates the first three formants as local maxima of the LPC spectral
 * envelope. The frame is downsampled to ~12 kHz first so narrow vocal-tract
 * poles stay numerically well-conditioned; this is the "finer/calmer" analysis
 * FOR-03 calls for rather than the live spectrogram's fixed presets.
 */
export function estimateFormants(input: Float32Array, options: FormantOptions): FormantEstimate | null {
  const { sampleRate } = options;
  const order = options.order ?? 12;
  const windowSize = Math.min(input.length, options.windowSize ?? Math.round(sampleRate * 0.05));
  const minFrequency = options.minFrequency ?? 60;
  const maxFrequency = options.maxFrequency ?? 4500;
  const preEmphasis = options.preEmphasis ?? 0.97;
  const gridHz = options.gridHz ?? 2;
  const peakFloor = options.peakFloor ?? 0.2;
  const minSpacing = options.minSpacing ?? 100;

  const factor = Math.max(1, Math.round(sampleRate / 12000));
  const analysisRate = sampleRate / factor;
  if (windowSize / factor < order + 1) return null;

  const downsampled = lowpassDecimate(input.subarray(0, windowSize), factor);
  const frame = new Float64Array(downsampled.length);
  for (let n = 0; n < downsampled.length; n++) {
    const value = downsampled[n]!;
    frame[n] = n === 0 ? value : value - preEmphasis * downsampled[n - 1]!;
  }
  const window = hammingWindow(frame.length);
  for (let n = 0; n < frame.length; n++) frame[n] = frame[n]! * window[n]!;

  const autocorr = autocorrelation(new Float32Array(frame), order);
  const { coefficients, error } = levinsonDurbin(autocorr, order);
  if (!(autocorr[0]! > 0) || !Number.isFinite(error)) return null;

  // Evaluate the LPC envelope magnitude on a fine grid at the analysis rate.
  const gridCount = Math.floor((maxFrequency - minFrequency) / gridHz) + 1;
  const envelope = new Float64Array(gridCount);
  let maxLog = -Infinity;
  for (let i = 0; i < gridCount; i++) {
    const frequency = minFrequency + i * gridHz;
    let re = 1;
    let im = 0;
    for (let k = 1; k <= order; k++) {
      const angle = 2 * Math.PI * frequency * k / analysisRate;
      const coefficient = coefficients[k]!;
      re += coefficient * Math.cos(angle);
      im -= coefficient * Math.sin(angle);
    }
    const logMagnitude = -0.5 * Math.log(re * re + im * im + 1e-18);
    envelope[i] = logMagnitude;
    if (logMagnitude > maxLog) maxLog = logMagnitude;
  }

  // Candidate peaks above a relative floor.
  const threshold = maxLog + 20 * Math.log10(peakFloor);
  const peaks: { frequency: number; magnitude: number }[] = [];
  for (let i = 1; i < gridCount - 1; i++) {
    const value = envelope[i]!;
    if (value < threshold || value <= envelope[i - 1]! || value <= envelope[i + 1]!) continue;
    const denominator = envelope[i - 1]! - 2 * value + envelope[i + 1]!;
    const shift = denominator !== 0 ? 0.5 * (envelope[i - 1]! - envelope[i + 1]!) / denominator : 0;
    const clampedShift = Math.max(-0.5, Math.min(0.5, shift));
    peaks.push({ frequency: minFrequency + (i + clampedShift) * gridHz, magnitude: value });
  }
  peaks.sort((a, b) => a.frequency - b.frequency);

  // Enforce minimum spacing (keep the stronger of two close candidates).
  const separated: typeof peaks = [];
  for (const peak of peaks) {
    const last = separated[separated.length - 1];
    if (last && peak.frequency - last.frequency < minSpacing) {
      if (peak.magnitude > last.magnitude) separated[separated.length - 1] = peak;
    } else {
      separated.push(peak);
    }
  }

  if (separated.length === 0) return null;
  const confidence = Math.min(1, Math.max(0, 1 - error / autocorr[0]!));
  return { formants: separated.slice(0, 3).map((peak) => peak.frequency), confidence };
}
