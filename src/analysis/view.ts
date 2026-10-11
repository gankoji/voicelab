export const HISTORY_SECONDS = 30;
export const MAX_PLOT_WIDTH = 1024;
export const SPECTRUM_ROWS = 192;
export const FFT_SIZES = [1024, 2048, 4096] as const;

export const PALETTE_NAMES = ['viridis', 'magma', 'grayscale'] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export interface ViewSettings {
  historySeconds: number;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: 'linear' | 'log';
  fftSize: number;
  floorDb: number;
  ceilingDb: number;
  showRms: boolean;
  autoWaveformGain: boolean;
  palette: PaletteName;
  a4Hz: number;
}

export const DEFAULT_VIEW: ViewSettings = {
  historySeconds: 10, minFrequency: 50, maxFrequency: 10000,
  frequencyScale: 'linear', fftSize: 2048, floorDb: -90, ceilingDb: 0, showRms: false,
  autoWaveformGain: true, palette: 'viridis', a4Hz: 440,
};

function clamp(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeView(settings: ViewSettings, sampleRate: number): ViewSettings {
  const maxFrequency = clamp(settings.maxFrequency, 40, sampleRate / 2, Math.min(10000, sampleRate / 2));
  const ceilingDb = clamp(settings.ceilingDb, -60, 0, 0);
  return {
    historySeconds: clamp(settings.historySeconds, 0.005, HISTORY_SECONDS, 10),
    minFrequency: clamp(settings.minFrequency, 20, maxFrequency - 1, 20),
    maxFrequency,
    frequencyScale: settings.frequencyScale === 'log' ? 'log' : 'linear',
    fftSize: FFT_SIZES.some((size) => size === settings.fftSize) ? settings.fftSize : 2048,
    floorDb: clamp(settings.floorDb, -140, ceilingDb - 10, -90),
    ceilingDb,
    showRms: Boolean(settings.showRms),
    autoWaveformGain: Boolean(settings.autoWaveformGain),
    palette: PALETTE_NAMES.some((name) => name === settings.palette) ? settings.palette : 'viridis',
    a4Hz: clamp(settings.a4Hz, 300, 500, 440),
  };
}

/** Fraction runs from the lowest (0) to highest (1) displayed frequency. */
export function frequencyAt(fraction: number, settings: ViewSettings) {
  const { minFrequency: min, maxFrequency: max, frequencyScale } = settings;
  return frequencyScale === 'log'
    ? min * (max / min) ** fraction
    : min + fraction * (max - min);
}

export function frequencyFraction(frequency: number, settings: ViewSettings) {
  const { minFrequency: min, maxFrequency: max, frequencyScale } = settings;
  return frequencyScale === 'log'
    ? Math.log(frequency / min) / Math.log(max / min)
    : (frequency - min) / (max - min);
}

export interface PlotFrame {
  sampleRate: number;
  startSample: number;
  endSample: number;
  settings: ViewSettings;
  width: number;
  rows: number;
  /** Row-major intensity: 0 means missing; 1..255 means measured level. */
  spectrum: Uint8Array<ArrayBuffer>;
  minimum: Float32Array<ArrayBuffer>;
  maximum: Float32Array<ArrayBuffer>;
  rms: Float32Array<ArrayBuffer>;
  /** Individual samples at fine zoom, otherwise empty. NaN marks missing input. */
  trace: Float32Array<ArrayBuffer>;
  traceFirstSample: number;
  /** The "now" anchor for time labels (latest analyzable sample). */
  referenceEndSample: number;
}
