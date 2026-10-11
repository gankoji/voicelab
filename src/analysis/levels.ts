import type { MeterReading } from '../audio/protocol';

/** Warning threshold, not a claim to detect analog microphone clipping. */
export const NEAR_CLIP_DBFS = -0.1;
const NEAR_CLIP_AMPLITUDE = 10 ** (NEAR_CLIP_DBFS / 20);

export function amplitudeToDbfs(amplitude: number): number {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity;
}

export class LevelAccumulator {
  private sumSquares = 0;
  private peak = 0;
  private count = 0;
  private endSample = 0;
  private receivedSamples = 0;
  private droppedSamples = 0;
  private lastNearClipSample = -Infinity;

  constructor(private readonly sampleRate: number) {}

  add(samples: Float32Array, firstSample: number) {
    this.droppedSamples += Math.max(0, firstSample - this.endSample);
    for (let index = 0; index < samples.length; index++) {
      const value = samples[index]!;
      const magnitude = Math.abs(value);
      this.peak = Math.max(this.peak, magnitude);
      this.sumSquares += value * value;
      if (magnitude >= NEAR_CLIP_AMPLITUDE) this.lastNearClipSample = firstSample + index;
    }
    this.count += samples.length;
    this.receivedSamples += samples.length;
    this.endSample = firstSample + samples.length;
  }

  read(): MeterReading | null {
    if (this.count === 0) return null;
    const reading: MeterReading = {
      peakDbfs: amplitudeToDbfs(this.peak),
      rmsDbfs: amplitudeToDbfs(Math.sqrt(this.sumSquares / this.count)),
      nearClipping: this.endSample - this.lastNearClipSample <= this.sampleRate,
      endSample: this.endSample,
      receivedSamples: this.receivedSamples,
      droppedSamples: this.droppedSamples,
    };
    this.sumSquares = 0;
    this.peak = 0;
    this.count = 0;
    return reading;
  }
}
