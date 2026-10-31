import { Stft } from './stft';
import type { FrozenAnalysis } from './frozen-analysis';

export interface Overtone {
  harmonic: number;
  frequency: number;
  observations: number;
}

/** Estimate peaks from at most 200 voiced windows wholly inside the selection. */
export function analyzeOvertones(analysis: FrozenAnalysis, start: number, end: number): Overtone[] {
  const size = 4096;
  const half = size / 2;
  const points = analysis.pitchRange(start + half, end - half)
    .filter((p) => p.voiced && Number.isFinite(p.f0Hz) && p.f0Hz > 0);
  const stride = Math.max(1, Math.ceil(points.length / 200));
  const sums = new Float64Array(9);
  const counts = new Uint32Array(9);
  const binHz = analysis.sampleRate / size;
  for (let i = 0; i < points.length; i += stride) {
    const point = points[i]!;
    const first = Math.round(point.sampleIndex) - half;
    const samples = analysis.slice(first, first + size);
    if (samples.length !== size || samples.some((sample) => !Number.isFinite(sample))) continue;
    const stft = new Stft(size, (spectrum) => {
      const strongest = Math.max(...spectrum);
      for (let harmonic = 2; harmonic <= 8; harmonic++) {
        const target = point.f0Hz * harmonic;
        const radius = point.f0Hz * 0.25;
        const low = Math.max(1, Math.ceil((target - radius) / binHz));
        const high = Math.min(spectrum.length - 2, Math.floor((target + radius) / binHz));
        let best = -1;
        for (let bin = low; bin <= high; bin++) {
          if (spectrum[bin]! > spectrum[bin - 1]! && spectrum[bin]! > spectrum[bin + 1]! &&
              (best < 0 || spectrum[bin]! > spectrum[best]!)) best = bin;
        }
        if (best < 0 || spectrum[best]! < -80 || spectrum[best]! < strongest - 40) continue;
        const left = spectrum[best - 1]!, middle = spectrum[best]!, right = spectrum[best + 1]!;
        const denominator = left - 2 * middle + right;
        const offset = denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator));
        sums[harmonic]! += (best + offset) * binHz;
        counts[harmonic]!++;
      }
    });
    stft.push(samples, first);
  }
  return Array.from({ length: 7 }, (_, index) => index + 2)
    .filter((harmonic) => counts[harmonic]! > 0)
    .map((harmonic) => ({ harmonic, frequency: sums[harmonic]! / counts[harmonic]!, observations: counts[harmonic]! }));
}
