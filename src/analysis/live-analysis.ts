import { AudioHistory } from '../buffers/audio-history';
import { SpectralHistory } from '../buffers/spectral-history';
import { Stft } from './stft';
import { DEFAULT_VIEW, HISTORY_SECONDS, MAX_PLOT_WIDTH, normalizeView, SPECTRUM_ROWS } from './view';
import type { PlotFrame, ViewSettings } from './view';

export class LiveAnalysis {
  readonly audio: AudioHistory;
  private stft: Stft;
  private spectra: SpectralHistory;

  constructor(readonly sampleRate: number) {
    // Retain 30 visible seconds plus margins for the shared delayed view and centered RMS.
    this.audio = new AudioHistory(Math.ceil(sampleRate * (HISTORY_SECONDS + 0.02)) + 4096);
    this.spectra = this.createSpectra(DEFAULT_VIEW.fftSize);
    this.stft = this.createStft(DEFAULT_VIEW.fftSize);
  }

  /** Retained history only: excludes bounded FFT scratch space and per-view transfer buffers. */
  get retainedBytes() {
    return this.audio.byteLength + this.spectra.byteLength;
  }

  private createSpectra(size: number) {
    const hop = size / 4;
    return new SpectralHistory(Math.ceil(HISTORY_SECONDS * this.sampleRate / hop) + 2, size, hop);
  }

  private createStft(size: number) {
    return new Stft(size, (spectrum, center) => this.spectra.append(spectrum, center));
  }

  append(samples: Float32Array, firstSample: number) {
    this.audio.append(samples, firstSample);
    this.stft.push(samples, firstSample);
  }

  render(requested: ViewSettings, requestedWidth: number): PlotFrame {
    const settings = normalizeView(requested, this.sampleRate);
    if (this.stft.size !== settings.fftSize) {
      // Explicitly restart spectral history; do not mix incompatible analysis settings.
      this.spectra = this.createSpectra(settings.fftSize);
      this.stft = this.createStft(settings.fftSize);
    }
    const width = Math.max(1, Math.min(MAX_PLOT_WIDTH, Math.round(requestedWidth) || 1));
    // Delay both panels equally so even sample-level views include analyzed spectrum.
    const endSample = Math.max(0, this.audio.endSample - this.stft.size / 2);
    const startSample = endSample - settings.historySeconds * this.sampleRate;
    const minimum = new Float32Array(width).fill(NaN);
    const maximum = new Float32Array(width).fill(NaN);
    const rms = new Float32Array(width).fill(NaN);
    const samplesPerPixel = (endSample - startSample) / width;
    for (let x = 0; x < width; x++) {
      const first = Math.ceil(startSample + x * samplesPerPixel);
      const end = Math.min(endSample, Math.ceil(startSample + (x + 1) * samplesPerPixel));
      const summary = this.audio.summarize(first, end);
      if (summary) {
        minimum[x] = summary.minimum;
        maximum[x] = summary.maximum;
      }
      if (settings.showRms) {
        // Centered 20 ms RMS; missing/future samples remain gaps, never zero padding.
        const center = Math.round(startSample + (x + 0.5) * samplesPerPixel);
        const halfWindow = Math.round(0.01 * this.sampleRate);
        const rmsSummary = this.audio.summarize(center - halfWindow, center + halfWindow);
        if (rmsSummary) rms[x] = Math.sqrt(rmsSummary.sumSquares / rmsSummary.count);
      }
    }
    const traceFirstSample = Math.ceil(startSample);
    const trace = new Float32Array(samplesPerPixel <= 1 ? Math.max(0, endSample - traceFirstSample) : 0);
    for (let i = 0; i < trace.length; i++) trace[i] = this.audio.sampleAt(traceFirstSample + i);
    return {
      sampleRate: this.sampleRate, startSample, endSample, settings, width, rows: SPECTRUM_ROWS,
      spectrum: this.spectra.rasterize(startSample, endSample, width, SPECTRUM_ROWS, this.sampleRate, settings),
      minimum, maximum, rms, trace, traceFirstSample,
    };
  }
}
