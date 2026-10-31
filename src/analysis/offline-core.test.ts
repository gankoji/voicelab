import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../audio/protocol';
import { FormantTracker } from './formant-tracker';
import type { FormantPoint } from './formants';
import { analyzeOfflineCore } from './offline-core';
import type { PitchPoint } from './pitch';
import { PitchTracker } from './pitch-tracker';

describe('offline analysis', () => {
  it('handles empty and shorter-than-window recordings', () => {
    expect(analyzeOfflineCore(new Float32Array(0), 48000)).toEqual({ pitch: [], formants: [] });
    expect(analyzeOfflineCore(new Float32Array(2047), 48000)).toEqual({ pitch: [], formants: [] });
  });

  it('matches live block ingestion across voiced and silent transitions, including a partial block', () => {
    const sampleRate = 48000;
    const samples = new Float32Array(BLOCK_SIZE * 15 + 700);
    for (let i = 0; i < samples.length; i++) {
      if (i < 6000 || i >= 11000) samples[i] = 0.6 * Math.sin(2 * Math.PI * 180 * i / sampleRate);
    }
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
    }
    const result = analyzeOfflineCore(samples, sampleRate);
    expect(result).toEqual({ pitch, formants });
    expect(result.pitch.some((point) => point.voiced)).toBe(true);
    expect(result.pitch.some((point) => !point.voiced)).toBe(true);
    expect(result.formants.some((point) => point.confidence === 0)).toBe(true);
    expect(result.pitch.at(-1)!.sampleIndex).toBeGreaterThan(BLOCK_SIZE * 14);
  });
});
