import { BLOCK_SIZE } from '../audio/protocol';
import { FormantTracker } from './formant-tracker';
import type { FormantPoint } from './formants';
import type { PitchPoint } from './pitch';
import { PitchTracker } from './pitch-tracker';

/** Analyze the entire recording using the same batching and trackers as live capture. */
export function analyzeOfflineCore(samples: Float32Array, sampleRate: number, onProgress?: (fraction: number) => void): {
  pitch: PitchPoint[];
  formants: FormantPoint[];
} {
  const pitch: PitchPoint[] = [];
  const formants: FormantPoint[] = [];
  let voiced = false;
  const pitchTracker = new PitchTracker((point) => {
    voiced = point.voiced;
    pitch.push(point);
  }, { sampleRate, windowSize: 2048, hop: 512 });
  const formantTracker = new FormantTracker((point) => formants.push(point), () => voiced, {
    sampleRate, windowSize: 2400, hop: 1024, order: 12,
  });
  for (let first = 0; first < samples.length; first += BLOCK_SIZE) {
    const block = samples.subarray(first, first + BLOCK_SIZE);
    pitchTracker.ingest(block, first);
    formantTracker.ingest(block, first);
    if ((first / BLOCK_SIZE) % 128 === 0) onProgress?.(Math.min(1, (first + block.length) / samples.length));
  }
  onProgress?.(1);
  return { pitch, formants };
}
