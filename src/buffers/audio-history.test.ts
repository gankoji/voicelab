import { describe, expect, it } from 'vitest';
import { AudioHistory } from './audio-history';

describe('bounded audio history', () => {
  it('matches direct calculations across bucket boundaries, preserving brief peaks', () => {
    const audio = new AudioHistory(1024);
    const samples = Float32Array.from({ length: 1024 }, (_, n) => Math.sin(n) * 0.2);
    samples[333] = 0.95;
    audio.append(samples.subarray(0, 73), 0);
    audio.append(samples.subarray(73), 73);
    for (const [start, end] of [[0, 1024], [30, 799], [256, 512], [332, 334]]) {
      const range = samples.slice(start, end);
      const summary = audio.summarize(start!, end!)!;
      expect(summary.minimum).toBe(Math.min(...range));
      expect(summary.maximum).toBe(Math.max(...range));
      expect(summary.sumSquares).toBeCloseTo(range.reduce((sum, value) => sum + value * value, 0), 10);
    }
  });

  it('wraps without exposing stale samples or growing capacity', () => {
    const audio = new AudioHistory(256);
    for (let start = 0; start < 4096; start += 64) audio.append(new Float32Array(64).fill(start), start);
    expect(audio.capacity).toBe(256);
    expect(audio.endSample).toBe(4096);
    expect(audio.sampleAt(3839)).toBeNaN();
    expect(audio.sampleAt(3840)).toBe(3840);
    expect(audio.summarize(3840, 4096)?.count).toBe(256);
    expect(audio.summarize(0, 128)).toBeNull();
  });

  it('marks partial-bucket and long gaps as missing, not zeros or stale data', () => {
    const audio = new AudioHistory(256);
    audio.append(new Float32Array(32).fill(1), 0);
    audio.append(new Float32Array(64).fill(0.5), 64);
    expect(audio.summarize(0, 128)).toBeNull();
    expect(audio.sampleAt(40)).toBeNaN();
    expect(audio.summarize(64, 128)?.minimum).toBe(0.5);
    audio.append(new Float32Array(16).fill(0.25), 10000);
    expect(audio.sampleAt(9999)).toBeNaN();
    expect(audio.summarize(10000, 10016)?.maximum).toBe(0.25);
  });
});
