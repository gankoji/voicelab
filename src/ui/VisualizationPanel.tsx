import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CaptureController } from '../audio/capture-controller';
import { normalizeView } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import { LEGEND_GRADIENT } from '../visualization/palette';
import { PLOT_LEFT, PLOT_RIGHT, PlotRenderer } from '../visualization/plots';

export function VisualizationPanel({ controller, settings }: { controller: CaptureController; settings: ViewSettings }) {
  const status = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().status);
  const sampleRate = controller.getSnapshot().details?.sampleRate ?? controller.getView()?.sampleRate ?? 48000;
  const retained = controller.getView();
  const displayed = status !== 'running' && retained ? retained.settings : normalizeView(settings, sampleRate);
  const spectralRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const spectrum = spectralRef.current!;
    const wave = waveRef.current!;
    const renderer = new PlotRenderer();
    let previous: PlotFrame | null | undefined;
    let previousSize = '';
    let handle = 0;
    const draw = () => {
      controller.requestView(settings, Math.max(1, spectrum.clientWidth - PLOT_LEFT - PLOT_RIGHT));
      const frame = controller.getView();
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
  }, [controller, sampleRate, settings]);

  const stateLabel = status === 'running' ? 'Live' : controller.getView() ? 'Stopped · last view' : 'Ready';

  return (
    <section className="workspace" aria-label="Live visualization workspace">
      <section className="panel spectrum-panel" aria-labelledby="spectrogram-heading">
        <div className="panel-heading">
          <h2 id="spectrogram-heading">Spectrogram</h2><span>{stateLabel} · frequency in Hz</span>
        </div>
        <canvas ref={spectralRef} className="spectrum-canvas" role="img" aria-label="Live spectrogram: frequency against time, color indicates spectral amplitude">
          Spectrogram visualization. Digital peak and RMS levels are available numerically above.
        </canvas>
        <div className="color-legend" aria-label={`Spectral amplitude color scale: ${displayed.floorDb} to ${displayed.ceilingDb} dBFS`}>
          <span>{displayed.floorDb} dBFS</span>
          <span className="color-ramp" style={{ background: LEGEND_GRADIENT }} />
          <span>{displayed.ceilingDb} dBFS</span>
        </div>
      </section>
      <section className="panel waveform-panel" aria-labelledby="waveform-heading">
        <div className="panel-heading">
          <h2 id="waveform-heading">Waveform</h2><span>{displayed.showRms ? 'RMS on · ' : ''}{stateLabel} · linear amplitude</span>
        </div>
        <canvas ref={waveRef} className="waveform-canvas" role="img" aria-label="Live waveform: digital amplitude against time">
          Waveform visualization. Change visible history to 5 ms for individual sample detail.
        </canvas>
      </section>
    </section>
  );
}
