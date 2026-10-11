import { estimateFormants } from './formants';
import type { FormantOptions, FormantPoint } from './formants';

export interface FormantTrackerOptions extends FormantOptions {
  hop?: number;
}

/**
 * Tracks three formants across frames: nearest-candidate matching with a
 * per-formant tolerance, exponential smoothing, and a short hold so a missed
 * peak gaps out instead of the now-standard re-sorting that makes lines jump.
 */
export class FormantSmoother {
  private readonly tolerances = [220, 320, 480];
  private readonly frequencies: number[] = [NaN, NaN, NaN];
  private readonly missing: number[] = [0, 0, 0];

  constructor(private readonly holdFrames = 4, private readonly alpha = 0.3) {}

  update(candidates: number[]): number[] {
    const used = new Array(candidates.length).fill(false);

    for (let i = 0; i < 3; i++) {
      const current = this.frequencies[i]!;
      if (!Number.isFinite(current)) continue;
      let best = -1;
      let bestDistance = this.tolerances[i]!;
      for (let j = 0; j < candidates.length; j++) {
        if (used[j]) continue;
        const distance = Math.abs(candidates[j]! - current);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = j;
        }
      }
      if (best >= 0) {
        used[best] = true;
        this.frequencies[i] = current + this.alpha * (candidates[best]! - current);
        this.missing[i] = 0;
      } else {
        this.missing[i]!++;
      }
    }

    // Fill inactive tracks with the lowest unused candidates, so F1 < F2 < F3.
    for (let i = 0; i < 3; i++) {
      if (Number.isFinite(this.frequencies[i]!)) continue;
      let best = -1;
      let bestFrequency = Infinity;
      for (let j = 0; j < candidates.length; j++) {
        if (used[j] || !(candidates[j]! < bestFrequency)) continue;
        bestFrequency = candidates[j]!;
        best = j;
      }
      if (best >= 0) {
        used[best] = true;
        this.frequencies[i] = bestFrequency;
        this.missing[i] = 0;
      }
    }

    for (let i = 0; i < 3; i++) {
      if (this.missing[i]! >= this.holdFrames) this.frequencies[i] = NaN;
    }

    return [...this.frequencies];
  }
}

/** Streams samples and emits a formant point every hop once a full window is available. */
export class FormantTracker {
  private readonly ring: Float32Array;
  private readonly windowSize: number;
  private readonly hop: number;
  private readonly estimateOptions: FormantOptions;
  private readonly smoother = new FormantSmoother();
  private count = 0;
  private write = 0;
  private sinceHop = 0;
  private nextGlobal = 0;
  private lastGlobal = 0;

  constructor(
    private readonly onPoint: (point: FormantPoint) => void,
    private readonly isVoiced: () => boolean,
    options: FormantTrackerOptions,
  ) {
    this.windowSize = options.windowSize ?? Math.round(options.sampleRate * 0.05);
    this.hop = options.hop ?? Math.floor(this.windowSize / 2);
    this.ring = new Float32Array(this.windowSize);
    this.estimateOptions = {
      sampleRate: options.sampleRate,
      order: options.order,
      windowSize: this.windowSize,
      minFrequency: options.minFrequency,
      maxFrequency: options.maxFrequency,
      preEmphasis: options.preEmphasis,
      gridHz: options.gridHz,
      peakFloor: options.peakFloor,
      minSpacing: options.minSpacing,
    };
  }

  ingest(input: Float32Array, firstSample: number) {
    if (firstSample !== this.nextGlobal && this.count > 0) {
      this.count = 0;
      this.write = 0;
      this.sinceHop = 0;
    }
    this.nextGlobal = firstSample + input.length;
    for (let i = 0; i < input.length; i++) {
      this.ring[this.write] = input[i]!;
      this.lastGlobal = firstSample + i;
      this.write = (this.write + 1) % this.windowSize;
      if (this.count < this.windowSize) this.count++;
      this.sinceHop++;
      if (this.count === this.windowSize && this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        const center = this.lastGlobal - (this.windowSize - 1) / 2;
        if (!this.isVoiced()) {
          this.onPoint({ sampleIndex: center, formants: [NaN, NaN, NaN], confidence: 0 });
          continue;
        }
        const window = new Float32Array(this.windowSize);
        for (let k = 0; k < this.windowSize; k++) window[k] = this.ring[(this.write + k) % this.windowSize]!;
        const estimate = estimateFormants(window, this.estimateOptions);
        const formants = this.smoother.update(estimate?.formants ?? []);
        this.onPoint({ sampleIndex: center, formants, confidence: estimate?.confidence ?? 0 });
      }
    }
  }
}

/** Bounded ring of formant points, addressable by sample index. */
export class FormantHistory {
  private points: FormantPoint[];
  private next = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.points = new Array<FormantPoint>(capacity);
  }

  push(point: FormantPoint) {
    this.points[this.next] = point;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  range(start: number, end: number): FormantPoint[] {
    if (this.count === 0) return [];
    const out: FormantPoint[] = [];
    for (let i = 0; i < this.count; i++) {
      const index = (this.next - this.count + i + this.capacity) % this.capacity;
      const point = this.points[index]!;
      if (point.sampleIndex >= start && point.sampleIndex < end) out.push(point);
    }
    return out;
  }
}
