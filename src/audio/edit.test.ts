import { describe, expect, it } from 'vitest';
import { cutSamples, pasteSamples } from './edit';

describe('non-destructive sample edits', () => {
  it('cuts and inserts half-open ranges while preserving gaps and inputs', () => {
    const source = new Float32Array([1, NaN, 3, 4]);
    const clip = source.slice(1, 3);
    const cut = cutSamples(source, 1, 3);
    expect(Array.from(cut)).toEqual([1, 4]);
    expect(Array.from(pasteSamples(cut, clip, 1))).toEqual(Array.from(source));
    expect(Array.from(source)).toEqual([1, NaN, 3, 4]);
    expect(Array.from(pasteSamples(cut, clip, 0))).toEqual([NaN, 3, 1, 4]);
    expect(Array.from(pasteSamples(cut, clip, 2))).toEqual([1, 4, NaN, 3]);
  });
  it('rejects invalid ranges and insertion positions', () => {
    const samples = new Float32Array([1, 2]);
    for (const [start, end] of [[0, 2], [-1, 1], [1, 1], [0, 3], [0.5, 1]]) {
      expect(() => cutSamples(samples, start!, end!)).toThrow(RangeError);
    }
    for (const position of [-1, 3, 0.5, NaN]) {
      expect(() => pasteSamples(samples, samples, position)).toThrow(RangeError);
    }
  });
});
