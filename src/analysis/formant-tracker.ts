import { estimateFormants } from './formants';
import type { FormantOptions, FormantPoint } from './formants';

export interface FormantTrackerOptions extends FormantOptions {
  hop?: number;
}

/** Streams samples and emits a formant point every hop once a full window is available. */
export class FormantTracker {
  private readonly ring: Float32Array;
  private readonly windowSize: number;
  private readonly hop: number;
  private readonly estimateOptions: FormantOptions;
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
        if (this.isVoiced()) {
          const window = new Float32Array(this.windowSize);
          for (let k = 0; k < this.windowSize; k++) window[k] = this.ring[(this.write + k) % this.windowSize]!;
          const estimate = estimateFormants(window, this.estimateOptions);
          this.onPoint({ sampleIndex: center, formants: estimate?.formants ?? [], confidence: estimate?.confidence ?? 0 });
        } else {
          this.onPoint({ sampleIndex: center, formants: [], confidence: 0 });
        }
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
