import { frequencyFraction } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import { PALETTE } from './palette';

export const PLOT_LEFT = 54;
export const PLOT_RIGHT = 12;
const TOP = 12;
const BOTTOM = 30;

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
  return { context, width, height, plotWidth: width - PLOT_LEFT - PLOT_RIGHT, plotHeight: height - TOP - BOTTOM };
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

export class PlotRenderer {
  private rasterCanvas = document.createElement('canvas');
  private image: ImageData | undefined;

  draw(spectrogram: HTMLCanvasElement, waveform: HTMLCanvasElement, frame: PlotFrame | null, fallback: ViewSettings) {
    const spectral = prepare(spectrogram);
    const wave = prepare(waveform);
    if (!spectral || !wave) return;
    const settings = frame?.settings ?? fallback;

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
        this.image.data[offset] = PALETTE[color]!;
        this.image.data[offset + 1] = PALETTE[color + 1]!;
        this.image.data[offset + 2] = PALETTE[color + 2]!;
        this.image.data[offset + 3] = 255;
      }
      rasterContext.putImageData(this.image, 0, 0);
      spectral.context.imageSmoothingEnabled = false;
      spectral.context.drawImage(this.rasterCanvas, PLOT_LEFT, TOP, spectral.plotWidth, spectral.plotHeight);
      this.drawWave(wave.context, wave.plotWidth, wave.plotHeight, frame);
    } else {
      for (const plot of [spectral, wave]) {
        plot.context.fillStyle = '#bdd0d7';
        plot.context.textAlign = 'center';
        plot.context.fillText('Start the microphone to see live audio', plot.width / 2, plot.height / 2);
      }
    }

    spectral.context.fillStyle = '#bdd0d7';
    spectral.context.textAlign = 'right';
    let lastY = -Infinity;
    const ticks = [settings.maxFrequency, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, settings.minFrequency];
    for (const frequency of [...new Set(ticks)].sort((a, b) => b - a)) {
      if (frequency < settings.minFrequency || frequency > settings.maxFrequency) continue;
      const y = TOP + (1 - frequencyFraction(frequency, settings)) * spectral.plotHeight;
      if (y - lastY < 20) continue;
      spectral.context.fillText(frequency >= 1000 ? `${frequency / 1000}k` : String(frequency), PLOT_LEFT - 8, y + 4);
      lastY = y;
    }
    for (const amplitude of [-1, 0, 1]) {
      wave.context.fillStyle = '#bdd0d7';
      wave.context.textAlign = 'right';
      const y = TOP + (1 - amplitude) / 2 * wave.plotHeight;
      wave.context.fillText(String(amplitude), PLOT_LEFT - 8, y + 4);
    }
    timeAxis(spectral.context, spectral.width, spectral.height, settings.historySeconds);
    timeAxis(wave.context, wave.width, wave.height, settings.historySeconds);

    // Useful diagnostics also let integration tests check that both views share a frame.
    for (const canvas of [spectrogram, waveform]) {
      canvas.dataset.endSample = String(frame?.endSample ?? 0);
      canvas.dataset.historySeconds = String(settings.historySeconds);
      canvas.dataset.fftSize = String(settings.fftSize);
      canvas.dataset.frequencyScale = settings.frequencyScale;
      canvas.dataset.traceSamples = String(frame?.trace.length ?? 0);
    }
  }

  private drawWave(context: CanvasRenderingContext2D, width: number, height: number, frame: PlotFrame) {
    const y = (sample: number) => TOP + (1 - Math.max(-1, Math.min(1, sample))) / 2 * height;
    context.save();
    context.beginPath();
    context.rect(PLOT_LEFT, TOP, width, height);
    context.clip();
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
}
