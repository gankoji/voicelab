import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CaptureController } from '../audio/capture-controller';
import { normalizeView } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import { LEGEND_GRADIENT } from '../visualization/palette';
import { PLOT_LEFT, PLOT_RIGHT, PLOT_TOP, PLOT_BOTTOM, PlotRenderer } from '../visualization/plots';
import { inspectSpectrum, inspectWaveform } from '../visualization/inspection';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const timeLabel = (seconds: number) => Math.abs(seconds) < 1
  ? `${Number((seconds * 1000).toFixed(2))} ms`
  : `${Number(seconds.toFixed(2))} s`;

interface SpectrumPointer { px: number; py: number; xf: number; yf: number; }
interface WavePointer { px: number; xf: number; }

export function VisualizationPanel({ controller, settings, frozenFrame }: {
  controller: CaptureController;
  settings: ViewSettings;
  frozenFrame: PlotFrame | null;
}) {
  const status = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().status);
  const sampleRate = frozenFrame?.sampleRate
    ?? controller.getSnapshot().details?.sampleRate
    ?? controller.getView()?.sampleRate ?? 48000;
  const retained = controller.getView();
  const displayed = frozenFrame
    ? frozenFrame.settings
    : status !== 'running' && retained ? retained.settings : normalizeView(settings, sampleRate);
  const spectralRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const [spectrumInspect, setSpectrumInspect] = useState<SpectrumPointer | null>(null);
  const [waveInspect, setWaveInspect] = useState<WavePointer | null>(null);

  useEffect(() => {
    const spectrum = spectralRef.current!;
    const wave = waveRef.current!;
    const renderer = new PlotRenderer();
    let previous: PlotFrame | null | undefined;
    let previousSize = '';
    let handle = 0;
    const draw = () => {
      let frame: PlotFrame | null;
      if (frozenFrame) {
        frame = frozenFrame;
      } else {
        controller.requestView(settings, Math.max(1, spectrum.clientWidth - PLOT_LEFT - PLOT_RIGHT));
        frame = controller.getView();
      }
      const size = `${spectrum.clientWidth}:${spectrum.clientHeight}:${wave.clientHeight}:${window.devicePixelRatio}`;
      if (frame !== previous || size !== previousSize) {
        renderer.draw(spectrum, wave, frame, normalizeView(settings, sampleRate));
        previous = frame;
        previousSize = size;
      }
      handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [controller, sampleRate, settings, frozenFrame]);

  const stateLabel = frozenFrame
    ? 'Frozen · capture continues'
    : status === 'running' ? 'Live' : retained ? 'Stopped · last view' : 'Ready';

  const onSpectrumPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!frozenFrame) return;
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
  const onWavePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!frozenFrame) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
    setWaveInspect({ px, xf: plotWidth > 0 ? clamp01((px - PLOT_LEFT) / plotWidth) : 0 });
  };

  const spectrumReading = frozenFrame && spectrumInspect
    ? inspectSpectrum(frozenFrame, spectrumInspect.xf, spectrumInspect.yf)
    : null;
  const waveReading = frozenFrame && waveInspect
    ? inspectWaveform(frozenFrame, clamp01(waveInspect.xf))
    : null;

  return (
    <section className="workspace" aria-label="Live visualization workspace">
      <section className="panel spectrum-panel" aria-labelledby="spectrogram-heading">
        <div className="panel-heading">
          <h2 id="spectrogram-heading">Spectrogram</h2><span>{stateLabel} · frequency in Hz</span>
        </div>
        <div className="canvas-frame">
          <canvas
            ref={spectralRef}
            className="spectrum-canvas"
            role="img"
            aria-label="Live spectrogram: frequency against time, color indicates spectral amplitude"
            onPointerMove={frozenFrame ? onSpectrumPointer : undefined}
            onPointerLeave={frozenFrame ? () => setSpectrumInspect(null) : undefined}
          >
            Spectrogram visualization. Digital peak and RMS levels are available numerically above.
          </canvas>
          {frozenFrame && spectrumInspect && (
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
            onPointerMove={frozenFrame ? onWavePointer : undefined}
            onPointerLeave={frozenFrame ? () => setWaveInspect(null) : undefined}
          >
            Waveform visualization. Change visible history to 5 ms for individual sample detail.
          </canvas>
          {frozenFrame && waveInspect && (
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
