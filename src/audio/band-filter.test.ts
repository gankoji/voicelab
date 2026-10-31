import { describe, expect, it } from 'vitest';
import { filterBand } from './band-filter';

const rate = 48000;
const tone = (frequency: number) => Float32Array.from({ length: rate }, (_, i) => Math.sin(2 * Math.PI * frequency * i / rate));
const amplitude = (samples: Float32Array, frequency: number) => {
  let sine = 0, cosine = 0;
  for (let i = rate / 2; i < rate; i++) {
    sine += samples[i]! * Math.sin(2 * Math.PI * frequency * i / rate);
    cosine += samples[i]! * Math.cos(2 * Math.PI * frequency * i / rate);
  }
  return Math.hypot(sine, cosine) * 4 / rate;
};

describe('frequency-band filter', () => {
  it('keeps the selected band and attenuates frequencies outside it', () => {
    expect(amplitude(filterBand(tone(250), rate, 0, rate, 180, 350, 'keep'), 250)).toBeGreaterThan(0.95);
    expect(amplitude(filterBand(tone(1500), rate, 0, rate, 180, 350, 'keep'), 1500)).toBeLessThan(0.13);
    expect(amplitude(filterBand(tone(180), rate, 0, rate, 180, 350, 'keep'), 180)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('reduces the selected band while preserving distant tones', () => {
    expect(amplitude(filterBand(tone(250), rate, 0, rate, 180, 350, 'reduce'), 250)).toBeLessThan(0.05);
    expect(amplitude(filterBand(tone(1500), rate, 0, rate, 180, 350, 'reduce'), 1500)).toBeGreaterThan(0.98);
  });

  it('changes only the interval, preserves gaps, and resets state at gaps', () => {
    const input = tone(250);
    input[20000] = NaN;
    const output = filterBand(input, rate, 10000, 30000, 180, 350, 'keep');
    expect(output.slice(0, 10000)).toEqual(input.slice(0, 10000));
    expect(output.slice(30000)).toEqual(input.slice(30000));
    expect(output[20000]).toBeNaN();
    expect(output[20001]).toBeCloseTo(filterBand(input, rate, 20001, 20002, 180, 350, 'keep')[20001]!, 7);
    expect(input[10001]).not.toBe(output[10001]);
  });

  it('rejects invalid ranges and bands', () => {
    expect(() => filterBand(tone(250), rate, 1, 1, 180, 350, 'keep')).toThrow(RangeError);
    expect(() => filterBand(tone(250), rate, 0, rate, 350, 180, 'keep')).toThrow(RangeError);
    expect(() => filterBand(tone(250), rate, 0, rate, 0, 350, 'reduce')).toThrow(RangeError);
    expect(() => filterBand(tone(250), rate, 0, rate, 180, rate / 2, 'reduce')).toThrow(RangeError);
  });
});
