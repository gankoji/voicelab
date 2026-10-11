import { frequencyAt } from '../analysis/view';
import type { ViewSettings } from '../analysis/view';

/** A preallocated ring; storage depends on retention and FFT size, not session length. */
export class SpectralHistory {
  private spectra: Float32Array;
  private centers: Float64Array;
  private next = 0;
  private count = 0;
  readonly bins: number;

  constructor(readonly capacity: number, readonly fftSize: number, readonly hopSize: number) {
    this.bins = fftSize / 2 + 1;
    this.spectra = new Float32Array(capacity * this.bins);
    this.centers = new Float64Array(capacity);
  }

  get byteLength() {
    return this.spectra.byteLength + this.centers.byteLength;
  }

  append(spectrum: Float32Array, center: number) {
    this.spectra.set(spectrum, this.next * this.bins);
    this.centers[this.next] = center;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  rasterize(
    start: number, end: number, width: number, rows: number,
    sampleRate: number, settings: ViewSettings,
  ): Uint8Array<ArrayBuffer> {
    const raster = new Uint8Array(width * rows);
    const lowBins = new Uint32Array(rows);
    const highBins = new Uint32Array(rows);
    const rowLevels = new Uint8Array(rows);
    for (let y = 0; y < rows; y++) {
      lowBins[y] = Math.min(this.bins - 1, Math.round(frequencyAt(1 - (y + 1) / rows, settings) * this.fftSize / sampleRate));
      highBins[y] = Math.min(this.bins - 1, Math.round(frequencyAt(1 - y / rows, settings) * this.fftSize / sampleRate));
    }
    const samplesPerPixel = (end - start) / width;
    for (let i = 0; i < this.count; i++) {
      const slot = (this.next - this.count + i + this.capacity) % this.capacity;
      const center = this.centers[slot]!;
      // Paint a hop-wide cell centered on the analysis timestamp, not the window end.
      const left = center - this.hopSize / 2;
      const right = center + this.hopSize / 2;
      if (right <= start || left >= end) continue;
      const x0 = Math.max(0, Math.floor((left - start) / samplesPerPixel));
      const x1 = Math.min(width, Math.ceil((right - start) / samplesPerPixel));
      for (let y = 0; y < rows; y++) {
        let level = -Infinity;
        for (let bin = lowBins[y]!; bin <= highBins[y]!; bin++) {
          level = Math.max(level, this.spectra[slot * this.bins + bin]!);
        }
        rowLevels[y] = 1 + Math.round(254 * Math.min(1, Math.max(0,
          (level - settings.floorDb) / (settings.ceilingDb - settings.floorDb),
        )));
      }
      // Max-reduction in frequency/time keeps short, narrow peaks visible.
      for (let y = 0; y < rows; y++) {
        for (let x = x0; x < x1; x++) {
          const index = y * width + x;
          raster[index] = Math.max(raster[index]!, rowLevels[y]!);
        }
      }
    }
    return raster;
  }
}
