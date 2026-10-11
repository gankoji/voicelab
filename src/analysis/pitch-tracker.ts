import { estimatePitchYin, PITCH_VOICING_CONFIDENCE } from './pitch';
import type { PitchOptions, PitchPoint } from './pitch';

export interface PitchTrackerOptions extends PitchOptions {
  hop?: number;
  windowSize?: number;
}

/**
 * Streams samples and emits a pitch point every hop once a full window is
 * available. A sample-index discontinuity resets the window so gaps are not
 * bridged into a false period.
 */
export class PitchTracker {
  private readonly ring: Float32Array;
  private readonly windowSize: number;
  private readonly hop: number;
  private readonly estimateOptions: PitchOptions;
  private count = 0;
  private write = 0;
  private sinceHop = 0;
  private nextGlobal = 0;
  private lastGlobal = 0;

  constructor(private readonly onPoint: (point: PitchPoint) => void, options: PitchTrackerOptions) {
    this.windowSize = options.windowSize ?? 2048;
    this.hop = options.hop ?? Math.floor(this.windowSize / 4);
    this.ring = new Float32Array(this.windowSize);
    this.estimateOptions = {
      sampleRate: options.sampleRate,
      minFrequency: options.minFrequency,
      maxFrequency: options.maxFrequency,
      threshold: options.threshold,
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
        const window = new Float32Array(this.windowSize);
        for (let k = 0; k < this.windowSize; k++) {
          window[k] = this.ring[(this.write + k) % this.windowSize]!;
        }
        const center = this.lastGlobal - (this.windowSize - 1) / 2;
        const estimate = estimatePitchYin(window, this.estimateOptions);
        if (estimate) {
          this.onPoint({
            sampleIndex: center,
            f0Hz: estimate.f0Hz,
            confidence: estimate.confidence,
            voiced: estimate.confidence >= PITCH_VOICING_CONFIDENCE,
          });
        } else {
          this.onPoint({ sampleIndex: center, f0Hz: 0, confidence: 0, voiced: false });
        }
      }
    }
  }
}
