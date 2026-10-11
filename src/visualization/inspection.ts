import type { PlotFrame } from '../analysis/view';
import { frequencyAt } from '../analysis/view';

export interface SpectrumReading {
  /** Seconds before the displayed end (0 at the right edge). */
  timeSeconds: number;
  frequency: number;
  /** Approximate dBFS reconstructed from the indexed-color raster, or null for a gap. */
  levelDb: number | null;
}

export interface WaveformReading {
  timeSeconds: number;
  minimum: number | null;
  maximum: number | null;
}

function timeAt(frame: PlotFrame, fraction: number) {
  const duration = (frame.endSample - frame.startSample) / frame.sampleRate;
  return -(1 - fraction) * duration;
}

export function inspectSpectrum(frame: PlotFrame, xFraction: number, yFraction: number): SpectrumReading {
  const x = Math.min(frame.width - 1, Math.max(0, Math.floor(xFraction * frame.width)));
  const row = Math.min(frame.rows - 1, Math.max(0, Math.floor(yFraction * frame.rows)));
  const value = frame.spectrum[row * frame.width + x]!;
  const levelDb = value === 0
    ? null
    : frame.settings.floorDb + (value - 1) / 254 * (frame.settings.ceilingDb - frame.settings.floorDb);
  return {
    timeSeconds: timeAt(frame, xFraction),
    frequency: frequencyAt(1 - yFraction, frame.settings),
    levelDb,
  };
}

export function inspectWaveform(frame: PlotFrame, xFraction: number): WaveformReading {
  const x = Math.min(frame.width - 1, Math.max(0, Math.floor(xFraction * frame.width)));
  const minimum = frame.minimum[x];
  const maximum = frame.maximum[x];
  return {
    timeSeconds: timeAt(frame, xFraction),
    minimum: typeof minimum === 'number' && Number.isFinite(minimum) ? minimum : null,
    maximum: typeof maximum === 'number' && Number.isFinite(maximum) ? maximum : null,
  };
}
