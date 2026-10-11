import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type { CaptureController } from '../audio/capture-controller';
import { normalizeView } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import { clampFrozenRange } from '../analysis/frozen-analysis';
import type { FrozenView } from './App';
import { PALETTES } from '../visualization/palette';
import { PLOT_LEFT, PLOT_RIGHT, PLOT_TOP, PLOT_BOTTOM, PlotRenderer } from '../visualization/plots';
import { inspectSpectrum, inspectWaveform } from '../visualization/inspection';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const timeLabel = (seconds: number) => Math.abs(seconds) < 1
  ? `${Number((seconds * 1000).toFixed(2))} ms`
  : `${Number(seconds.toFixed(2))} s`;

interface SpectrumPointer { px: number; py: number; xf: number; yf: number; }
interface WavePointer { px: number; xf: number; }

function settingsKey(settings: ViewSettings) {
  return `${settings.historySeconds}|${settings.minFrequency}|${settings.maxFrequency}|${settings.frequencyScale}|${settings.fftSize}|${settings.floorDb}|${settings.ceilingDb}|${settings.showRms}|${settings.autoWaveformGain}|${settings.palette}`;
}

export function VisualizationPanel({ controller, settings, frozen, onFrozenRangeChange, spectralCanvas, waveCanvas }: {
  controller: CaptureController;
  settings: ViewSettings;
  frozen: FrozenView | null;
  onFrozenRangeChange: (start: number, end: number) => void;
  spectralCanvas: MutableRefObject<HTMLCanvasElement | null>;
  waveCanvas: MutableRefObject<HTMLCanvasElement | null>;
}) {
  const status = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().status);
  const sampleRate = frozen?.analysis.sampleRate
    ?? controller.getSnapshot().details?.sampleRate
    ?? controller.getView()?.sampleRate ?? 48000;
  const retained = controller.getView();
  const displayed = frozen
    ? normalizeView(settings, sampleRate)
    : status !== 'running' && retained ? retained.settings : normalizeView(settings, sampleRate);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const rangeChangeRef = useRef(onFrozenRangeChange);
  rangeChangeRef.current = onFrozenRangeChange;
  const frozenFrameRef = useRef<PlotFrame | null>(null);
  const panRef = useRef<{ px: number; start: number; end: number } | null>(null);
  const [spectrumInspect, setSpectrumInspect] = useState<SpectrumPointer | null>(null);
  const [waveInspect, setWaveInspect] = useState<WavePointer | null>(null);

  const applyZoom = (fraction: number, factor: number) => {
    const current = frozenRef.current;
    if (!current) return;
    const span = current.end - current.start;
    const anchor = current.start + fraction * span;
    const minDuration = Math.max(64, Math.round(current.analysis.sampleRate * 0.002));
    const newSpan = Math.max(minDuration, Math.min(current.analysis.displayEnd, span * factor));
    const clamped = clampFrozenRange(current.analysis, anchor - fraction * newSpan, anchor + (1 - fraction) * newSpan);
    rangeChangeRef.current(clamped.start, clamped.end);
  };

  const applyPan = (deltaSamples: number) => {
    const current = frozenRef.current;
    if (!current) return;
    const clamped = clampFrozenRange(current.analysis, current.start + deltaSamples, current.end + deltaSamples);
    rangeChangeRef.current(clamped.start, clamped.end);
  };

  const resetToHistory = () => {
    const current = frozenRef.current;
    if (!current) return;
    const end = current.analysis.displayEnd;
    rangeChangeRef.current(Math.max(0, end - settings.historySeconds * current.analysis.sampleRate), end);
  };

  const jumpToLatest = () => {
    const current = frozenRef.current;
    if (!current) return;
    const span = current.end - current.start;
    rangeChangeRef.current(current.analysis.displayEnd - span, current.analysis.displayEnd);
  };

  // Live or frozen rendering. Frozen re-renders only when the range, settings, or size change.
  useEffect(() => {
    const spectrum = spectralCanvas.current!;
    const wave = waveCanvas.current!;
    const renderer = new PlotRenderer();
    let handle = 0;
    let previousFrame: PlotFrame | null | undefined;
    let previousSize = '';
    let previousFrozenSig = '';
    const draw = () => {
      const size = `${spectrum.clientWidth}:${spectrum.clientHeight}:${wave.clientHeight}:${window.devicePixelRatio}`;
      const fz = frozenRef.current;
      if (fz) {
        const width = Math.max(1, spectrum.clientWidth - PLOT_LEFT - PLOT_RIGHT);
        const sig = `${fz.start}:${fz.end}:${size}:${settingsKey(settings)}`;
        if (sig !== previousFrozenSig) {
          const frame = fz.analysis.renderRange(fz.start, fz.end, settings, width);
          renderer.draw(spectrum, wave, frame, normalizeView(settings, sampleRate));
          frozenFrameRef.current = frame;
          previousFrozenSig = sig;
        }
      } else {
        controller.requestView(settings, Math.max(1, spectrum.clientWidth - PLOT_LEFT - PLOT_RIGHT));
        const frame = controller.getView();
        if (frame !== previousFrame || size !== previousSize) {
          renderer.draw(spectrum, wave, frame, normalizeView(settings, sampleRate));
          previousFrame = frame;
          previousSize = size;
        }
      }
      handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [controller, sampleRate, settings, frozen?.analysis]);

  // Native non-passive wheel so frozen zoom can preventDefault without page scroll.
  useEffect(() => {
    const fz = frozenRef.current;
    if (!fz) return;
    const canvas = spectralCanvas.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!frozenRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
      const fraction = plotWidth > 0 ? clamp01((event.clientX - rect.left - PLOT_LEFT) / plotWidth) : 0.5;
      applyZoom(fraction, Math.exp(event.deltaY * 0.0022));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [frozen !== null]);

  const beginPan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = frozenRef.current;
    if (!current || event.button !== 0) return;
    panRef.current = { px: event.clientX, start: current.start, end: current.end };
    setSpectrumInspect(null);
    setWaveInspect(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    const current = frozenRef.current;
    if (!pan || !current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
    const span = pan.end - pan.start;
    const delta = plotWidth > 0 ? -((event.clientX - pan.px) / plotWidth) * span : 0;
    const clamped = clampFrozenRange(current.analysis, pan.start + delta, pan.end + delta);
    rangeChangeRef.current(clamped.start, clamped.end);
  };

  const endPan = () => { panRef.current = null; };

  const moveKeyCrosshair = (horizontal: number, vertical: number, plotWidth: number, plotHeight: number) => {
    const step = 0.02;
    const current = spectrumInspect ?? { px: PLOT_LEFT + plotWidth / 2, py: PLOT_TOP + plotHeight / 2, xf: 0.5, yf: 0.5 };
    const xf = clamp01(current.xf + horizontal * step);
    const yf = clamp01(current.yf + vertical * step);
    setSpectrumInspect({ xf, yf, px: PLOT_LEFT + xf * plotWidth, py: PLOT_TOP + yf * plotHeight });
  };

  const onSpectrumKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!frozenRef.current) return;
    const current = frozenRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
    const plotHeight = rect.height - PLOT_TOP - PLOT_BOTTOM;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.shiftKey) applyPan(direction * (current.end - current.start) * 0.1);
        else moveKeyCrosshair(direction, 0, plotWidth, plotHeight);
        event.preventDefault();
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown':
        moveKeyCrosshair(0, event.key === 'ArrowUp' ? -1 : 1, plotWidth, plotHeight);
        event.preventDefault();
        break;
      case '+':
      case '=':
        applyZoom(0.5, 0.75);
        event.preventDefault();
        break;
      case '-':
      case '_':
        applyZoom(0.5, 1.25);
        event.preventDefault();
        break;
      case 'Home':
        resetToHistory();
        event.preventDefault();
        break;
      case 'End':
        jumpToLatest();
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  const onSpectrumPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) { movePan(event); return; }
    if (!frozenRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
    const plotHeight = rect.height - PLOT_TOP - PLOT_BOTTOM;
    setSpectrumInspect({
      px, py,
      xf: plotWidth > 0 ? clamp01((px - PLOT_LEFT) / plotWidth) : 0,
      yf: plotHeight > 0 ? clamp01((py - PLOT_TOP) / plotHeight) : 0,
    });
  };

  const onWavePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) { movePan(event); return; }
    if (!frozenRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
    setWaveInspect({ px, xf: plotWidth > 0 ? clamp01((px - PLOT_LEFT) / plotWidth) : 0 });
  };

  const stateLabel = frozen
    ? (status === 'running' ? 'Paused · capture continues' : 'Paused · recording stopped')
    : status === 'running' ? 'Live' : retained ? 'Stopped · last view' : 'Ready';
  const spectrumReading = frozenFrameRef.current && spectrumInspect
    ? inspectSpectrum(frozenFrameRef.current, spectrumInspect.xf, spectrumInspect.yf) : null;
  const waveReading = frozenFrameRef.current && waveInspect
    ? inspectWaveform(frozenFrameRef.current, waveInspect.xf) : null;

  return (
    <section className="workspace" aria-label="Live visualization workspace">
      <section className="panel spectrum-panel" aria-labelledby="spectrogram-heading">
        <div className="panel-heading">
          <h2 id="spectrogram-heading">Spectrogram</h2>
          <span>{frozen ? 'Paused — scroll to zoom, drag to pan' : `${stateLabel} · frequency in Hz`}</span>
        </div>
        <div className="canvas-frame">
          <canvas
            ref={spectralCanvas}
            className="spectrum-canvas"
            role="img"
            tabIndex={frozen ? 0 : -1}
            aria-label="Live spectrogram: frequency against time, color indicates spectral amplitude. When paused, use arrow keys to move the cursor, Shift+arrows to pan, and + or - to zoom."
            onPointerDown={frozen ? beginPan : undefined}
            onPointerMove={frozen ? onSpectrumPointerMove : undefined}
            onPointerUp={frozen ? endPan : undefined}
            onPointerCancel={frozen ? endPan : undefined}
            onLostPointerCapture={frozen ? endPan : undefined}
            onPointerLeave={frozen ? () => { endPan(); setSpectrumInspect(null); } : undefined}
            onKeyDown={frozen ? onSpectrumKeyDown : undefined}
          >
            Spectrogram visualization. Digital peak and RMS levels are available numerically above.
          </canvas>
          {frozen && spectrumInspect && !panRef.current && (
            <>
              <span className="cursor-x" style={{ left: `${spectrumInspect.px}px` }} aria-hidden="true" />
              <span className="cursor-y" style={{ top: `${spectrumInspect.py}px` }} aria-hidden="true" />
              <output className="inspect-readout spectrum-readout" aria-label="Spectrogram inspection" aria-live="polite">
                {spectrumReading
                  ? `${timeLabel(spectrumReading.timeSeconds)} · ${spectrumReading.frequency.toFixed(1)} Hz · ${spectrumReading.levelDb === null ? 'no data' : `≈${spectrumReading.levelDb.toFixed(0)} dBFS`}`
                  : 'no data'}
              </output>
            </>
          )}
        </div>
        <div className="color-legend" aria-label={`Spectral amplitude color scale: ${displayed.floorDb} to ${displayed.ceilingDb} dBFS`}>
          <span>{displayed.floorDb} dBFS</span>
          <span className="color-ramp" style={{ background: PALETTES[displayed.palette].legendGradient }} />
          <span>{displayed.ceilingDb} dBFS</span>
        </div>
      </section>
      <section className="panel waveform-panel" aria-labelledby="waveform-heading">
        <div className="panel-heading">
          <h2 id="waveform-heading">Waveform</h2><span>{displayed.showRms ? 'RMS on · ' : ''}{displayed.autoWaveformGain ? 'Auto gain · ' : ''}{stateLabel} · linear amplitude</span>
        </div>
        <div className="canvas-frame">
          <canvas
            ref={waveCanvas}
            className="waveform-canvas"
            role="img"
            aria-label="Live waveform: digital amplitude against time"
            onPointerDown={frozen ? beginPan : undefined}
            onPointerMove={frozen ? onWavePointerMove : undefined}
            onPointerUp={frozen ? endPan : undefined}
            onPointerCancel={frozen ? endPan : undefined}
            onLostPointerCapture={frozen ? endPan : undefined}
            onPointerLeave={frozen ? () => { endPan(); setWaveInspect(null); } : undefined}
          >
            Waveform visualization. Change visible history to 5 ms for individual sample detail.
          </canvas>
          {frozen && waveInspect && !panRef.current && (
            <>
              <span className="cursor-x" style={{ left: `${waveInspect.px}px` }} aria-hidden="true" />
              <output className="inspect-readout waveform-readout" aria-label="Waveform inspection">
                {waveReading
                  ? `${timeLabel(waveReading.timeSeconds)} · ${waveReading.maximum === null ? 'no data' : `amp ${waveReading.minimum!.toFixed(2)} / ${waveReading.maximum!.toFixed(2)}`}`
                  : 'no data'}
              </output>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
