import type { PlotFrame } from '../analysis/view';

/** Peak shown after auto-gain fills ~90% of the half-height. */
export const WAVEFORM_TARGET = 0.9;
/** Never amplify quiet digital noise into a full-scale display. */
export const WAVEFORM_NOISE_FLOOR = 1e-3; // -60 dBFS
/** Cap auto-gain so a faint signal is visible without growing unboundedly. */
export const WAVEFORM_MAX_GAIN = 100;

export interface WaveformScale {
  /** Multiplied against samples; always >= 1 (auto-gain only amplifies). */
  gain: number;
  /** Largest digital amplitude shown at the edge of the plot (1 / gain). */
  maxAmplitude: number;
}

export function computeWaveformScale(frame: PlotFrame, autoGain: boolean): WaveformScale {
  if (!autoGain) return { gain: 1, maxAmplitude: 1 };
  let peak = 0;
  if (frame.trace.length) {
    for (let i = 0; i < frame.trace.length; i++) {
      const value = frame.trace[i]!;
      if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
    }
  } else {
    for (let i = 0; i < frame.width; i++) {
      const minimum = frame.minimum[i];
      const maximum = frame.maximum[i];
      if (typeof minimum === 'number' && Number.isFinite(minimum)) peak = Math.max(peak, Math.abs(minimum));
      if (typeof maximum === 'number' && Number.isFinite(maximum)) peak = Math.max(peak, Math.abs(maximum));
    }
  }
  if (!Number.isFinite(peak) || peak < WAVEFORM_NOISE_FLOOR) {
    return { gain: 1, maxAmplitude: 1 };
  }
  const gain = Math.min(WAVEFORM_MAX_GAIN, Math.max(1, WAVEFORM_TARGET / peak));
  return { gain, maxAmplitude: 1 / gain };
}
