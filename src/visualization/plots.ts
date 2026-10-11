import { frequencyFraction } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import type { PitchPoint } from '../analysis/pitch';
import type { FormantPoint } from '../analysis/formants';
import { PALETTES } from './palette';
import { computeWaveformScale } from './scale';

export const PLOT_LEFT = 54;
export const PLOT_RIGHT = 12;
export const PLOT_TOP = 12;
export const PLOT_BOTTOM = 30;

function prepare(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = '#0a1820';
  context.fillRect(0, 0, width, height);
  context.font = '11px system-ui';
  return { context, width, height, plotWidth: width - PLOT_LEFT - PLOT_RIGHT, plotHeight: height - PLOT_TOP - PLOT_BOTTOM };
}

function timeAxis(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  const plotWidth = width - PLOT_LEFT - PLOT_RIGHT;
  context.fillStyle = '#bdd0d7';
  for (let i = 0; i <= 4; i++) {
    const t = -seconds * (1 - i / 4);
    const label = seconds < 1 ? `${Number((t * 1000).toFixed(2))} ms` : `${Number(t.toFixed(2))} s`;
    context.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
    context.fillText(label, PLOT_LEFT + i / 4 * plotWidth, height - 10);
  }
}

function formatAmplitude(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude === 0) return '0';
  if (magnitude >= 0.1) return value.toFixed(1);
  if (magnitude >= 0.01) return value.toFixed(2);
  if (magnitude >= 0.001) return value.toFixed(3);
  if (magnitude >= 0.0001) return value.toFixed(4);
  return value.toExponential(1);
}

export class PlotRenderer {
  private rasterCanvas = document.createElement('canvas');
  private image: ImageData | undefined;

  draw(spectrogram: HTMLCanvasElement, waveform: HTMLCanvasElement, frame: PlotFrame | null, fallback: ViewSettings, pitch: PitchPoint[] = [], formants: FormantPoint[] = []) {
    const spectral = prepare(spectrogram);
    const wave = prepare(waveform);
    if (!spectral || !wave) return;
    const settings = frame?.settings ?? fallback;
    const palette = PALETTES[settings.palette];
    const waveScale = frame
      ? computeWaveformScale(frame, frame.settings.autoWaveformGain)
      : { gain: 1, maxAmplitude: 1 };

    if (frame) {
      if (this.rasterCanvas.width !== frame.width || this.rasterCanvas.height !== frame.rows) {
        this.rasterCanvas.width = frame.width;
        this.rasterCanvas.height = frame.rows;
        this.image = undefined;
      }
      const rasterContext = this.rasterCanvas.getContext('2d')!;
      this.image ??= rasterContext.createImageData(frame.width, frame.rows);
      for (let i = 0; i < frame.spectrum.length; i++) {
        const color = frame.spectrum[i]! * 4;
        const offset = i * 4;
        this.image.data[offset] = palette.colors[color]!;
        this.image.data[offset + 1] = palette.colors[color + 1]!;
        this.image.data[offset + 2] = palette.colors[color + 2]!;
        this.image.data[offset + 3] = 255;
      }
      rasterContext.putImageData(this.image, 0, 0);
      spectral.context.imageSmoothingEnabled = false;
      spectral.context.drawImage(this.rasterCanvas, PLOT_LEFT, PLOT_TOP, spectral.plotWidth, spectral.plotHeight);
      this.drawWave(wave.context, wave.plotWidth, wave.plotHeight, frame, waveScale.gain);
      if (pitch.length) this.drawPitch(spectral.context, spectral.plotWidth, spectral.plotHeight, frame, pitch);
      if (formants.length) this.drawFormants(spectral.context, spectral.plotWidth, spectral.plotHeight, frame, formants);
    } else {
      for (const plot of [spectral, wave]) {
        plot.context.fillStyle = '#bdd0d7';
        plot.context.textAlign = 'center';
        plot.context.fillText('Press Record to begin', plot.width / 2, plot.height / 2);
      }
    }

    spectral.context.fillStyle = '#bdd0d7';
    spectral.context.textAlign = 'right';
    let lastY = -Infinity;
    const ticks = [settings.maxFrequency, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, settings.minFrequency];
    for (const frequency of [...new Set(ticks)].sort((a, b) => b - a)) {
      if (frequency < settings.minFrequency || frequency > settings.maxFrequency) continue;
      const y = PLOT_TOP + (1 - frequencyFraction(frequency, settings)) * spectral.plotHeight;
      if (y - lastY < 20) continue;
      spectral.context.fillText(frequency >= 1000 ? `${frequency / 1000}k` : String(frequency), PLOT_LEFT - 8, y + 4);
      lastY = y;
    }
    for (const amplitude of [waveScale.maxAmplitude, 0, -waveScale.maxAmplitude]) {
      wave.context.fillStyle = '#bdd0d7';
      wave.context.textAlign = 'right';
      const normalized = amplitude / waveScale.maxAmplitude;
      const y = PLOT_TOP + (1 - normalized) / 2 * wave.plotHeight;
      wave.context.fillText(formatAmplitude(amplitude), PLOT_LEFT - 8, y + 4);
    }
    timeAxis(spectral.context, spectral.width, spectral.height, settings.historySeconds);
    timeAxis(wave.context, wave.width, wave.height, settings.historySeconds);

    // Useful diagnostics also let integration tests check that both views share a frame.
    for (const canvas of [spectrogram, waveform]) {
      canvas.dataset.endSample = String(frame?.endSample ?? 0);
      canvas.dataset.historySeconds = String(settings.historySeconds);
      canvas.dataset.fftSize = String(settings.fftSize);
      canvas.dataset.frequencyScale = settings.frequencyScale;
      canvas.dataset.palette = settings.palette;
      canvas.dataset.traceSamples = String(frame?.trace.length ?? 0);
    }
  }

  private drawWave(context: CanvasRenderingContext2D, width: number, height: number, frame: PlotFrame, gain: number) {
    const y = (sample: number) => PLOT_TOP + (1 - Math.max(-1, Math.min(1, sample * gain))) / 2 * height;
    context.save();
    context.beginPath();
    context.rect(PLOT_LEFT, PLOT_TOP, width, height);
    context.clip();

    // A zero-amplitude reference makes a real silent input distinguishable from
    // the not-yet-captured region, which is tinted instead of left to look flat.
    context.strokeStyle = 'rgba(189, 208, 215, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(PLOT_LEFT, y(0));
    context.lineTo(PLOT_LEFT + width, y(0));
    context.stroke();
    if (!frame.trace.length) {
      context.fillStyle = 'rgba(255, 255, 255, 0.05)';
      const columnWidth = width / frame.width;
      for (let i = 0; i < frame.width; i++) {
        if (!Number.isFinite(frame.minimum[i]!)) {
          context.fillRect(PLOT_LEFT + columnWidth * i, PLOT_TOP, columnWidth + 1, height);
        }
      }
    }

    context.strokeStyle = '#b4eadc';
    context.lineWidth = 1;
    context.beginPath();
    if (frame.trace.length) {
      let connected = false;
      for (let i = 0; i < frame.trace.length; i++) {
        const value = frame.trace[i]!;
        if (!Number.isFinite(value)) { connected = false; continue; }
        const x = PLOT_LEFT + (frame.traceFirstSample + i - frame.startSample) / (frame.endSample - frame.startSample) * width;
        if (connected) context.lineTo(x, y(value));
        else context.moveTo(x, y(value));
        connected = true;
      }
    } else {
      for (let i = 0; i < frame.width; i++) {
        if (!Number.isFinite(frame.minimum[i]!)) continue;
        const x = PLOT_LEFT + (i + 0.5) / frame.width * width;
        const top = y(frame.maximum[i]!);
        context.moveTo(x, top);
        context.lineTo(x, Math.max(top + 0.6, y(frame.minimum[i]!)));
      }
    }
    context.stroke();
    if (frame.settings.showRms) {
      context.strokeStyle = '#fbd56c';
      context.lineWidth = 2;
      context.beginPath();
      let connected = false;
      for (let i = 0; i < frame.rms.length; i++) {
        const value = frame.rms[i]!;
        if (!Number.isFinite(value)) { connected = false; continue; }
        const x = PLOT_LEFT + (i + 0.5) / frame.width * width;
        if (connected) context.lineTo(x, y(value));
        else context.moveTo(x, y(value));
        connected = true;
      }
      context.stroke();
    }
    context.restore();
  }

  private drawPitch(context: CanvasRenderingContext2D, width: number, height: number, frame: PlotFrame, pitch: PitchPoint[]) {
    context.save();
    context.beginPath();
    context.rect(PLOT_LEFT, PLOT_TOP, width, height);
    context.clip();
    context.strokeStyle = '#2ee6ff';
    context.lineWidth = 2;
    context.beginPath();
    let connected = false;
    for (const point of pitch) {
      if (!point.voiced) { connected = false; continue; }
      const x = PLOT_LEFT + (point.sampleIndex - frame.startSample) / (frame.endSample - frame.startSample) * width;
      const y = PLOT_TOP + (1 - frequencyFraction(point.f0Hz, frame.settings)) * height;
      if (connected) context.lineTo(x, y);
      else context.moveTo(x, y);
      connected = true;
    }
    context.stroke();
    context.restore();
  }

  private drawFormants(context: CanvasRenderingContext2D, width: number, height: number, frame: PlotFrame, formants: FormantPoint[]) {
    const colors = ['#ffb347', '#c56bff', '#79e6a0'];
    for (let index = 0; index < 3; index++) {
      context.save();
      context.beginPath();
      context.rect(PLOT_LEFT, PLOT_TOP, width, height);
      context.clip();
      context.strokeStyle = colors[index]!;
      context.lineWidth = 1.5;
      context.beginPath();
      let connected = false;
      for (const point of formants) {
        const frequency = point.formants[index];
        if (frequency === undefined || !Number.isFinite(frequency)) { connected = false; continue; }
        const x = PLOT_LEFT + (point.sampleIndex - frame.startSample) / (frame.endSample - frame.startSample) * width;
        const y = PLOT_TOP + (1 - frequencyFraction(frequency, frame.settings)) * height;
        if (connected) context.lineTo(x, y);
        else context.moveTo(x, y);
        connected = true;
      }
      context.stroke();
      context.restore();
    }
  }
}
