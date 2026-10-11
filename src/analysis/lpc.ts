/** Unbiased-ish autocorrelation for lags 0..maxLag on a windowed frame. */
export function autocorrelation(samples: Float32Array, maxLag: number): Float64Array {
  const r = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let n = 0; n < samples.length - lag; n++) sum += samples[n]! * samples[n + lag]!;
    r[lag] = sum;
  }
  return r;
}

/** Hamming window in-place, or a new Float64Array when no output is provided. */
export function hammingWindow(length: number): Float64Array {
  const out = new Float64Array(length);
  for (let n = 0; n < length; n++) out[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (length - 1));
  return out;
}

/**
 * Levinson-Durbin solution of the Yule-Walker equations for AR(p).
 * Returns coefficients `a` with a[0] = 1 so `H(z) = 1/(1 + sum a[k] z^-k)`.
 */
export function levinsonDurbin(r: Float64Array, order: number): { coefficients: Float64Array; error: number } {
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let error = r[0] ?? 0;
  if (error <= 0 || !Number.isFinite(error)) return { coefficients: a, error: 0 };

  for (let i = 1; i <= order; i++) {
    let acc = r[i] ?? 0;
    for (let j = 1; j < i; j++) acc += a[j]! * (r[i - j] ?? 0);
    const reflection = -acc / error;
    const previous = a.slice(0, i); // a[0..i-1]
    for (let j = 1; j < i; j++) a[j] = previous[j]! + reflection * previous[i - j]!;
    a[i] = reflection;
    error *= 1 - reflection * reflection;
    if (error <= 0) error = Number.MIN_VALUE;
  }
  return { coefficients: a, error };
}
