import { describe, expect, it } from 'vitest';
import { Stft } from './stft';

function tone(size: number, bin: number, amplitude = 1) {
  return Float32Array.from({ length: size }, (_, n) => amplitude * Math.sin(2 * Math.PI * bin * n / size));
}

describe('STFT normalization and timing', () => {
  it.each([1024, 2048, 4096])('normalizes a bin-centered sine for N=%i', (size) => {
    const frames: { bins: Float32Array; center: number }[] = [];
    const stft = new Stft(size, (bins, center) => frames.push({ bins: bins.slice(), center }));
    const input = tone(size, 19, 0.5);
    stft.push(input.subarray(0, 71), 0);
    stft.push(input.subarray(71), 71);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.center).toBe(size / 2);
    expect(frames[0]!.bins[19]).toBeCloseTo(-6.0206, 4);
    expect(frames[0]!.bins[18]).toBeCloseTo(-12.0412, 3); // Periodic Hann neighboring bin.
    expect(frames[0]!.bins[25]).toBeLessThan(-120);
  });

  it.each([0, 512])('does not double the DC or Nyquist endpoint (%i)', (bin) => {
    let bins: Float32Array | undefined;
    const stft = new Stft(1024, (spectrum) => { bins = spectrum.slice(); });
    stft.push(Float32Array.from({ length: 1024 }, (_, n) => 0.5 * Math.cos(2 * Math.PI * bin * n / 1024)), 0);
    expect(bins![bin]).toBeCloseTo(-6.0206, 4);
  });

  it('uses 75% overlap, preserves silence, and resets incomplete windows across gaps', () => {
    const frames: { center: number; bins: Float32Array }[] = [];
    const stft = new Stft(1024, (bins, center) => frames.push({ center, bins: bins.slice() }));
    stft.push(new Float32Array(2048), 0);
    expect(frames.map((frame) => frame.center)).toEqual([512, 768, 1024, 1280, 1536]);
    expect(frames[0]!.bins.every((value) => value === -Infinity)).toBe(true);
    stft.push(new Float32Array(1024), 4096);
    expect(frames.at(-1)!.center).toBe(4608);
    expect(frames).toHaveLength(6);
  });

  it('locates an off-bin 440 Hz tone within one bin at 44.1/48 kHz', () => {
    for (const sampleRate of [44100, 48000]) {
      let bins: Float32Array | undefined;
      const size = 2048;
      const stft = new Stft(size, (spectrum) => { bins = spectrum.slice(); });
      stft.push(Float32Array.from({ length: size }, (_, n) => Math.sin(2 * Math.PI * 440 * n / sampleRate)), 0);
      const peak = bins!.indexOf(Math.max(...bins!));
      expect(Math.abs(peak * sampleRate / size - 440)).toBeLessThan(sampleRate / size);
    }
  });

  it('preserves relative harmonic amplitudes and a 6.02 dB input change', () => {
    const frames: Float32Array[] = [];
    const stft = new Stft(2048, (spectrum) => frames.push(spectrum.slice()));
    const input = Float32Array.from({ length: 2048 }, (_, n) =>
      0.5 * Math.sin(2 * Math.PI * 20 * n / 2048) + 0.125 * Math.sin(2 * Math.PI * 40 * n / 2048),
    );
    stft.push(input, 0);
    stft.push(input.map((value) => value / 2), 4096); // Gap deliberately separates the two windows.
    expect(frames[0]![20]! - frames[0]![40]!).toBeCloseTo(12.0412, 3);
    expect(frames[1]![20]! - frames[0]![20]!).toBeCloseTo(-6.0206, 3);
  });

  it('follows a chirp across arbitrary batches without timing jumps', () => {
    const sampleRate = 48000;
    const length = 16384;
    const slope = 800 / (length / sampleRate);
    const frames: { center: number; peakHz: number }[] = [];
    const stft = new Stft(2048, (spectrum, center) => {
      frames.push({ center, peakHz: spectrum.indexOf(Math.max(...spectrum)) * sampleRate / 2048 });
    });
    const signal = Float32Array.from({ length }, (_, n) => {
      const t = n / sampleRate;
      return 0.5 * Math.sin(2 * Math.PI * (200 * t + slope * t * t / 2));
    });
    for (let first = 0; first < length; first += 317) stft.push(signal.subarray(first, first + 317), first);
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]!;
      expect(Math.abs(frame.peakHz - (200 + slope * frame.center / sampleRate))).toBeLessThan(2 * sampleRate / 2048);
      if (i) expect(frame.center - frames[i - 1]!.center).toBe(512);
    }
    expect(frames.at(-1)!.peakHz).toBeGreaterThan(frames[0]!.peakHz);
  });

  it('places the strongest impulse window within half a hop of the waveform transient', () => {
    const frames: { center: number; energy: number }[] = [];
    const stft = new Stft(1024, (spectrum, center) => frames.push({ center, energy: spectrum[20]! }));
    const signal = new Float32Array(4096);
    signal[1500] = 1;
    stft.push(signal, 0);
    const strongest = frames.reduce((a, b) => a.energy > b.energy ? a : b);
    expect(Math.abs(strongest.center - 1500)).toBeLessThanOrEqual(128);
  });
});
