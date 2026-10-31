export type BandFilterMode = 'keep' | 'reduce';

/**
 * Apply a second-order band-pass or notch to [start, end), preserving all other
 * samples and non-finite gaps. The band edges are the approximate -3 dB points.
 * Filter state resets at gaps and at the selection boundary; abrupt edits can
 * click. This is not a brick-wall filter and can change phase and peak level.
 */
export function filterBand(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
  lowHz: number,
  highHz: number,
  mode: BandFilterMode,
): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > samples.length || start >= end ||
      !Number.isFinite(lowHz) || !Number.isFinite(highHz) ||
      lowHz <= 0 || lowHz >= highHz || highHz >= sampleRate / 2 ||
      (mode !== 'keep' && mode !== 'reduce')) {
    throw new RangeError('Choose a non-empty interval and a positive frequency band below Nyquist.');
  }

  // Prewarp the requested edge frequencies for the bilinear transform.
  const low = Math.tan(Math.PI * lowHz / sampleRate);
  const high = Math.tan(Math.PI * highHz / sampleRate);
  const center = Math.sqrt(low * high);
  const omega = 2 * Math.atan(center);
  const quality = center / (high - low);
  const alpha = Math.sin(omega) / (2 * quality);
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(omega) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (mode === 'keep' ? alpha : 1) / a0;
  const b1 = mode === 'keep' ? 0 : a1;
  const b2 = (mode === 'keep' ? -alpha : 1) / a0;
  if (![a1, a2, b0, b1, b2].every(Number.isFinite)) {
    throw new RangeError('The frequency band is too extreme to filter reliably.');
  }

  const output = new Float32Array(samples);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = start; i < end; i++) {
    const x = samples[i]!;
    if (!Number.isFinite(x)) {
      x1 = x2 = y1 = y2 = 0;
      continue;
    }
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    if (!Number.isFinite(y) || Math.abs(y) > 3.402823466e38) {
      throw new RangeError('The filtered signal exceeded the supported range.');
    }
    output[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return output;
}
