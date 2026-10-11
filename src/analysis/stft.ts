import FFT from 'fft.js';
import { amplitudeToDbfs } from './levels';

/**
 * Periodic Hann, 75% overlap, single-sided peak-amplitude dBFS.
 * A bin-centered full-scale sine is 0 dBFS; DC/Nyquist are not doubled.
 */
export class Stft {
  readonly hopSize: number;
  private fft: FFT;
  private input: Float64Array;
  private window: Float64Array;
  private output: Float64Array;
  private spectrum: Float32Array;
  private samples: Float32Array;
  private windowSum = 0;
  private filled = 0;
  private firstSample = 0;
  private nextSample = 0;

  constructor(readonly size: number, private readonly emit: (spectrum: Float32Array, center: number) => void) {
    this.hopSize = size / 4;
    this.fft = new FFT(size);
    this.input = new Float64Array(size);
    this.window = new Float64Array(size);
    this.output = new Float64Array(size * 2);
    this.spectrum = new Float32Array(size / 2 + 1);
    this.samples = new Float32Array(size);
    for (let n = 0; n < size; n++) {
      this.window[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / size);
      this.windowSum += this.window[n]!;
    }
  }

  push(input: Float32Array, firstSample: number) {
    if (firstSample !== this.nextSample) this.filled = 0;
    this.nextSample = firstSample + input.length;
    let offset = 0;
    while (offset < input.length) {
      if (this.filled === 0) this.firstSample = firstSample + offset;
      const count = Math.min(this.size - this.filled, input.length - offset);
      this.samples.set(input.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled !== this.size) continue;
      for (let n = 0; n < this.size; n++) this.input[n] = this.samples[n]! * this.window[n]!;
      this.fft.realTransform(this.output, this.input);
      for (let bin = 0; bin < this.spectrum.length; bin++) {
        const gain = bin === 0 || bin === this.size / 2 ? 1 : 2;
        this.spectrum[bin] = amplitudeToDbfs(
          gain * Math.hypot(this.output[bin * 2]!, this.output[bin * 2 + 1]!) / this.windowSum,
        );
      }
      this.emit(this.spectrum, this.firstSample + this.size / 2);
      this.samples.copyWithin(0, this.hopSize);
      this.filled -= this.hopSize;
      this.firstSample += this.hopSize;
    }
  }
}
