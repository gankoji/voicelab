import { describe, expect, it } from 'vitest';
import { FrozenAnalysis } from './frozen-analysis';
import { analyzeOvertones } from './overtones';

describe('selection overtones', () => {
  it('measures a detuned peak rather than fabricating a pitch multiple', () => {
    const rate = 48000;
    const samples = Float32Array.from({ length: rate }, (_, i) =>
      0.6 * Math.sin(2 * Math.PI * 200 * i / rate) + 0.3 * Math.sin(2 * Math.PI * 407 * i / rate));
    const pitch = [{ sampleIndex: 12000, f0Hz: 200, confidence: 1, voiced: true }];
    const analysis = new FrozenAnalysis(rate, samples, 1024, pitch, [], true);
    const result = analyzeOvertones(analysis, 0, rate);
    expect(result.find((peak) => peak.harmonic === 2)?.frequency).toBeCloseTo(407, 0);
    expect(result.some((peak) => peak.harmonic === 3)).toBe(false);
    expect(analyzeOvertones(analysis, 0, 1000)).toEqual([]);
  });

  it('omits silence, unvoiced frames, and gaps', () => {
    const samples = new Float32Array(12000);
    const pitch = [{ sampleIndex: 6000, f0Hz: 200, confidence: 1, voiced: false }];
    expect(analyzeOvertones(new FrozenAnalysis(48000, samples, 1024, pitch, [], true), 0, 12000)).toEqual([]);
    samples[6000] = NaN;
    pitch[0]!.voiced = true;
    expect(analyzeOvertones(new FrozenAnalysis(48000, samples, 1024, pitch, [], true), 0, 12000)).toEqual([]);
  });
});
