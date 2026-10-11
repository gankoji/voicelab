import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CaptureController } from '../audio/capture-controller';
import { normalizeView } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import { clampFrozenRange } from '../analysis/frozen-analysis';
import type { FrozenView } from './App';
import { LEGEND_GRADIENT } from '../visualization/palette';
import { PLOT_LEFT, PLOT_RIGHT, PLOT_TOP, PLOT_BOTTOM, PlotRenderer } from '../visualization/plots';
import { inspectSpectrum, inspectWaveform } from '../visualization/inspection';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const timeLabel = (seconds: number) => Math.abs(seconds) < 1
  ? `${Number((seconds * 1000).toFixed(2))} ms`
  : `${Number(seconds.toFixed(2))} s`;

interface SpectrumPointer { px: number; py: number; xf: number; yf: number; }
interface WavePointer { px: number; xf: number; }

function settingsKey(settings: ViewSettings) {
  return `${settings.historySeconds}|${settings.minFrequency}|${settings.maxFrequency}|${settings.frequencyScale}|${settings.fftSize}|${settings.floorDb}|${settings.ceilingDb}|${settings.showRms}|${settings.autoWaveformGain}`;
}

export function VisualizationPanel({ controller, settings, frozen, onFrozenRangeChange }: {
  controller: CaptureController;
  settings: ViewSettings;
  frozen: FrozenView | null;
  onFrozenRangeChange: (start: number, end: number) => void;
}) {
  const status = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().status);
  const sampleRate = frozen?.analysis.sampleRate
    ?? controller.getSnapshot().details?.sampleRate
    ?? controller.getView()?.sampleRate ?? 48000;
  const retained = controller.getView();
  const displayed = frozen
    ? normalizeView(settings, sampleRate)
    : status !== 'running' && retained ? retained.settings : normalizeView(settings, sampleRate);
  const spectralRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const rangeChangeRef = useRef(onFrozenRangeChange);
  rangeChangeRef.current = onFrozenRangeChange;
  const frozenFrameRef = useRef<PlotFrame | null>(null);
  const panRef = useRef<{ px: number; start: number; end: number } | null>(null);
  const [spectrumInspect, setSpectrumInspect] = useState<SpectrumPointer | null>(null);
  const [waveInspect, setWaveInspect] = useState<WavePointer | null>(null);

  // Live or frozen rendering. Frozen re-renders only when the range, settings, or size change.
  useEffect(() => {
    const spectrum = spectralRef.current!;
    const wave = waveRef.current!;
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
    const canvas = spectralRef.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = frozenRef.current;
      if (!current) return;
      const rect = canvas.getBoundingClientRect();
      const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
      const fraction = plotWidth > 0 ? clamp01((event.clientX - rect.left - PLOT_LEFT) / plotWidth) : 0.5;
      const span = current.end - current.start;
      const anchor = current.start + fraction * span;
      const factor = Math.exp(event.deltaY * 0.0022);
      const minDuration = Math.max(64, Math.round(current.analysis.sampleRate * 0.002));
      const newSpan = Math.max(minDuration, Math.min(current.analysis.displayEnd, span * factor));
      const clamped = clampFrozenRange(current.analysis, anchor - fraction * newSpan, anchor + (1 - fraction) * newSpan);
      rangeChangeRef.current(clamped.start, clamped.end);
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

  const stateLabel = frozen ? 'Frozen · capture continues' : status === 'running' ? 'Live' : retained ? 'Stopped · last view' : 'Ready';
  const spectrumReading = frozenFrameRef.current && spectrumInspect
    ? inspectSpectrum(frozenFrameRef.current, spectrumInspect.xf, spectrumInspect.yf) : null;
  const waveReading = frozenFrameRef.current && waveInspect
    ? inspectWaveform(frozenFrameRef.current, waveInspect.xf) : null;

  return (
    <section className="workspace" aria-label="Live visualization workspace">
      <section className="panel spectrum-panel" aria-labelledby="spectrogram-heading">
        <div className="panel-heading">
          <h2 id="spectrogram-heading">Spectrogram</h2>
          <span>{frozen ? 'Frozen — scroll to zoom, drag to pan' : `${stateLabel} · frequency in Hz`}</span>
        </div>
        <div className="canvas-frame">
          <canvas
            ref={spectralRef}
            className="spectrum-canvas"
            role="img"
            aria-label="Live spectrogram: frequency against time, color indicates spectral amplitude"
            onPointerDown={frozen ? beginPan : undefined}
            onPointerMove={frozen ? onSpectrumPointerMove : undefined}
            onPointerUp={frozen ? endPan : undefined}
            onPointerCancel={frozen ? endPan : undefined}
            onLostPointerCapture={frozen ? endPan : undefined}
            onPointerLeave={frozen ? () => { endPan(); setSpectrumInspect(null); } : undefined}
          >
            Spectrogram visualization. Digital peak and RMS levels are available numerically above.
          </canvas>
          {frozen && spectrumInspect && !panRef.current && (
            <>
              <span className="cursor-x" style={{ left: `${spectrumInspect.px}px` }} aria-hidden="true" />
              <span className="cursor-y" style={{ top: `${spectrumInspect.py}px` }} aria-hidden="true" />
              <output className="inspect-readout spectrum-readout" aria-label="Spectrogram inspection">
                {spectrumReading
                  ? `${timeLabel(spectrumReading.timeSeconds)} · ${spectrumReading.frequency.toFixed(1)} Hz · ${spectrumReading.levelDb === null ? 'no data' : `≈${spectrumReading.levelDb.toFixed(0)} dBFS`}`
                  : 'no data'}
              </output>
            </>
          )}
        </div>
        <div className="color-legend" aria-label={`Spectral amplitude color scale: ${displayed.floorDb} to ${displayed.ceilingDb} dBFS`}>
          <span>{displayed.floorDb} dBFS</span>
          <span className="color-ramp" style={{ background: LEGEND_GRADIENT }} />
          <span>{displayed.ceilingDb} dBFS</span>
        </div>
      </section>
      <section className="panel waveform-panel" aria-labelledby="waveform-heading">
        <div className="panel-heading">
          <h2 id="waveform-heading">Waveform</h2><span>{displayed.showRms ? 'RMS on · ' : ''}{displayed.autoWaveformGain ? 'Auto gain · ' : ''}{stateLabel} · linear amplitude</span>
        </div>
        <div className="canvas-frame">
          <canvas
            ref={waveRef}
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
