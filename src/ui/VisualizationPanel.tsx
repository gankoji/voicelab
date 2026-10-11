import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CaptureController } from '../audio/capture-controller';
import { DEFAULT_VIEW, normalizeView } from '../analysis/view';
import type { PlotFrame, ViewSettings } from '../analysis/view';
import { LEGEND_GRADIENT } from '../visualization/palette';
import { PLOT_LEFT, PLOT_RIGHT, PlotRenderer } from '../visualization/plots';

export function VisualizationPanel({ controller }: { controller: CaptureController }) {
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_VIEW);
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
      const size = `${spectrum.clientWidth}:${window.devicePixelRatio}`;
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

  const update = (patch: Partial<ViewSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const controlsDisabled = status !== 'running' && controller.getView() !== null;
  const stateLabel = status === 'running' ? 'Live' : controller.getView() ? 'Stopped · last view' : 'Waiting for audio';

  return (
    <section className="workspace" aria-label="Live visualization workspace">
      <details className="view-controls panel">
        <summary>Display settings</summary>
        <fieldset disabled={controlsDisabled}>
          <legend className="visually-hidden">Live plot controls</legend>
          <label>Visible history
            <select value={settings.historySeconds} onChange={(e) => update({ historySeconds: Number(e.target.value) })}>
              <option value={0.005}>5 ms · sample detail</option>
              <option value={0.02}>20 ms · waveform detail</option>
              <option value={0.1}>100 ms</option>
              <option value={1}>1 second</option>
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
            </select>
          </label>
          <label>Frequency scale
            <select value={settings.frequencyScale} onChange={(e) => update({ frequencyScale: e.target.value as 'linear' | 'log' })}>
              <option value="linear">Linear · harmonic spacing</option>
              <option value="log">Logarithmic · pitch intervals</option>
            </select>
          </label>
          <label>Lowest frequency (Hz)
            <select value={settings.minFrequency} onChange={(e) => update({ minFrequency: Number(e.target.value) })}>
              {[20, 50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>Highest frequency (Hz)
            <select value={settings.maxFrequency} onChange={(e) => update({ maxFrequency: Number(e.target.value) })}>
              {[1000, 2000, 5000, 10000, 20000].map((value) => <option key={value} value={value}>{value.toLocaleString()}</option>)}
            </select>
          </label>
          <label>Analysis detail
            <select value={settings.fftSize} onChange={(e) => update({ fftSize: Number(e.target.value) })}>
              <option value={1024}>Timing · 1024 samples</option>
              <option value={2048}>Balanced · 2048 samples</option>
              <option value={4096}>Frequency · 4096 samples</option>
            </select>
          </label>
          <label>Color floor (dBFS)
            <select value={settings.floorDb} onChange={(e) => update({ floorDb: Number(e.target.value) })}>
              {[-120, -90, -60].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>Color ceiling (dBFS)
            <select value={settings.ceilingDb} onChange={(e) => update({ ceilingDb: Number(e.target.value) })}>
              {[-30, -15, 0].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="checkbox-control">
            <input type="checkbox" checked={settings.showRms} onChange={(e) => update({ showRms: e.target.checked })} />
            Show RMS amplitude
          </label>
        </fieldset>
        <p className="capture-note">
          Hann window · {(displayed.fftSize / sampleRate * 1000).toFixed(1)} ms ·
          {' '}{(sampleRate / displayed.fftSize).toFixed(1)} Hz bin spacing · 75% overlap.
          Changing analysis detail restarts spectral history.
        </p>
        <p className="capture-note">
          Displayed range: {displayed.minFrequency.toLocaleString()}–{displayed.maxFrequency.toLocaleString()} Hz,
          limited by Nyquist ({Math.round(sampleRate / 2).toLocaleString()} Hz).
          Up to 30 seconds are retained while capturing. Stop discards the rolling audio buffer; the last view remains.
        </p>
      </details>

      <section className="panel" aria-labelledby="spectrogram-heading">
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
        <p className="plot-caption">
          Peak-amplitude spectrum, not power density. Color is fixed, not auto-scaled.
          Blank regions have no complete analysis window.
        </p>
      </section>
      <section className="panel" aria-labelledby="waveform-heading">
        <div className="panel-heading">
          <h2 id="waveform-heading">Waveform</h2><span>{stateLabel} · linear amplitude</span>
        </div>
        <canvas ref={waveRef} className="waveform-canvas" role="img" aria-label="Live waveform: digital amplitude against time">
          Waveform visualization. Change visible history to 5 ms for individual sample detail.
        </canvas>
        <p className="plot-caption">
          Min/max overview; individual samples at fine zoom. {displayed.showRms && 'Yellow line: centered 20 ms RMS, on the same linear amplitude scale. '}
          Both plots share sample-based time; 0 is the latest displayed sample,
          delayed by half an analysis window to align with the spectrum.
        </p>
      </section>
    </section>
  );
}
