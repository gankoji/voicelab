import { AudioHistory } from '../buffers/audio-history';
import { SpectralHistory } from '../buffers/spectral-history';
import { Stft } from './stft';
import { MAX_PLOT_WIDTH, SPECTRUM_ROWS, normalizeView } from './view';
import type { PlotFrame, ViewSettings } from './view';
import type { PitchPoint } from './pitch';

/**
 * Re-analysis of an immutable raw-audio snapshot, used while the live view is
 * frozen. It holds its own history/spectra so the live worker keeps streaming.
 * The snapshot is analyzed once per FFT size; zoom/pan only re-rasterizes.
 */
export class FrozenAnalysis {
  readonly sampleRate: number;
  private readonly snapshot: Float32Array;
  private readonly audio: AudioHistory;
  private readonly pitch: PitchPoint[];
  private stft: Stft;
  private spectra: SpectralHistory;

  constructor(sampleRate: number, samples: Float32Array, initialFftSize: number, pitch: PitchPoint[] = []) {
    this.sampleRate = sampleRate;
    this.snapshot = samples;
    this.pitch = pitch;
    this.audio = new AudioHistory(samples.length);
    this.audio.append(samples, 0);
    this.spectra = this.createSpectra(initialFftSize);
    this.stft = this.createStft(initialFftSize);
    this.stft.push(samples, 0);
  }

  get endSample() {
    return this.audio.endSample;
  }

  /** A copy of samples in `[start, end)` within the snapshot; NaN gaps are preserved. */
  slice(start: number, end: number): Float32Array {
    const s = Math.max(0, Math.round(start));
    const e = Math.min(this.snapshot.length, Math.round(end));
    if (e <= s) return new Float32Array(0);
    return this.snapshot.slice(s, e);
  }

  /** Pitch points (snapshot-local sample index) within `[start, end)`, oldest first. */
  pitchRange(start: number, end: number): PitchPoint[] {
    return this.pitch.filter((point) => point.sampleIndex >= start && point.sampleIndex < end);
  }

  /** Rightmost sample whose analysis window is complete (aligned with the live view). */
  get displayEnd() {
    return Math.max(0, this.audio.endSample - this.stft.size / 2);
  }

  private createSpectra(size: number) {
    const hop = size / 4;
    return new SpectralHistory(Math.ceil(this.snapshot.length / hop) + 2, size, hop);
  }

  private createStft(size: number) {
    return new Stft(size, (spectrum, center) => this.spectra.append(spectrum, center));
  }

  private rebuild(size: number) {
    this.spectra = this.createSpectra(size);
    this.stft = this.createStft(size);
    this.stft.push(this.snapshot, 0);
  }

  renderRange(requestedStart: number, requestedEnd: number, requested: ViewSettings, requestedWidth: number): PlotFrame {
    const settings = normalizeView(requested, this.sampleRate);
    if (this.stft.size !== settings.fftSize) this.rebuild(settings.fftSize);
    const width = Math.max(1, Math.min(MAX_PLOT_WIDTH, Math.round(requestedWidth) || 1));
    const maxEnd = this.displayEnd;
    let start = Math.max(0, Math.round(requestedStart));
    let end = Math.min(maxEnd, Math.round(requestedEnd));
    if (start >= end) {
      start = Math.max(0, end - Math.max(64, settings.historySeconds * this.sampleRate));
      if (start >= end) start = Math.max(0, end - 1);
    }
    start = Math.max(0, Math.min(start, Math.max(0, end - 1)));

    const minimum = new Float32Array(width).fill(NaN);
    const maximum = new Float32Array(width).fill(NaN);
    const rms = new Float32Array(width).fill(NaN);
    const samplesPerPixel = (end - start) / width;
    for (let x = 0; x < width; x++) {
      const first = Math.ceil(start + x * samplesPerPixel);
      const last = Math.min(end, Math.ceil(start + (x + 1) * samplesPerPixel));
      const summary = this.audio.summarize(first, last);
      if (summary) {
        minimum[x] = summary.minimum;
        maximum[x] = summary.maximum;
      }
      if (settings.showRms) {
        const center = Math.round(start + (x + 0.5) * samplesPerPixel);
        const halfWindow = Math.round(0.01 * this.sampleRate);
        const rmsSummary = this.audio.summarize(center - halfWindow, center + halfWindow);
        if (rmsSummary) rms[x] = Math.sqrt(rmsSummary.sumSquares / rmsSummary.count);
      }
    }
    const traceFirstSample = Math.ceil(start);
    const trace = new Float32Array(samplesPerPixel <= 1 ? Math.max(0, end - traceFirstSample) : 0);
    for (let i = 0; i < trace.length; i++) trace[i] = this.audio.sampleAt(traceFirstSample + i);
    return {
      sampleRate: this.sampleRate, startSample: start, endSample: end, settings, width, rows: SPECTRUM_ROWS,
      spectrum: this.spectra.rasterize(start, end, width, SPECTRUM_ROWS, this.sampleRate, settings),
      minimum, maximum, rms, trace, traceFirstSample,
    };
  }
}

export function clampFrozenRange(analysis: FrozenAnalysis, start: number, end: number): { start: number; end: number } {
  const maxEnd = analysis.displayEnd;
  const minDuration = Math.max(64, Math.round(analysis.sampleRate * 0.002));
  let s = Math.round(start);
  let e = Math.round(end);
  if (e > maxEnd) { s -= e - maxEnd; e = maxEnd; }
  if (s < 0) { e -= s; s = 0; }
  if (e - s < minDuration) {
    e = Math.min(maxEnd, s + minDuration);
    if (e - s < minDuration) s = Math.max(0, e - minDuration);
  }
  if (s < 0) s = 0;
  if (e > maxEnd) e = maxEnd;
  if (e <= s) { s = Math.max(0, maxEnd - minDuration); e = maxEnd; }
  return { start: s, end: e };
}
