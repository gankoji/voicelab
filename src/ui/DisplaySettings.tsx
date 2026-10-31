import { useSyncExternalStore } from 'react';
import type { CaptureController } from '../audio/capture-controller';
import { normalizeView } from '../analysis/view';
import type { ViewSettings } from '../analysis/view';

export function DisplaySettings({ controller, settings, onChange, frozen, sampleRate: recordingSampleRate }: {
  controller: CaptureController;
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
  frozen: boolean;
  sampleRate?: number;
}) {
  const status = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().status);
  const retained = controller.getView();
  const sampleRate = recordingSampleRate ?? controller.getSnapshot().details?.sampleRate ?? retained?.sampleRate ?? 48000;
  const displayed = normalizeView(settings, sampleRate);
  const update = (patch: Partial<ViewSettings>) => onChange({ ...settings, ...patch });
  // Settings are editable whenever capture is not mid-request. While paused,
  // the snapshot is inspectable; changing visible history resets the zoomed
  // window and changing analysis detail re-analyzes the snapshot.
  const controlsDisabled = status === 'requesting';
  const stoppedWithView = status === 'stopped' && retained !== null && !frozen;

  return (
    <section className="view-controls" aria-labelledby="display-settings-heading">
      <h3 id="display-settings-heading">Display</h3>
      {stoppedWithView && <p className="capture-note">The stopped view stays as captured. New settings apply the next time you record.</p>}
      {frozen && <p className="capture-note">While paused, drag or scroll on the plots to zoom and pan. Changing visible history resets the zoomed window; changing analysis detail re-analyzes the snapshot.</p>}
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
        <label>Tuning reference (A4)
          <select value={settings.a4Hz} onChange={(e) => update({ a4Hz: Number(e.target.value) })}>
            {[415, 432, 440, 442, 444].map((value) => <option key={value} value={value}>{value} Hz</option>)}
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
        <label>Color palette
          <select value={settings.palette} onChange={(e) => update({ palette: e.target.value as ViewSettings['palette'] })}>
            <option value="viridis">Viridis · colorblind-friendly</option>
            <option value="magma">Magma · dark to bright</option>
            <option value="grayscale">Grayscale</option>
          </select>
        </label>
        <label className="checkbox-control">
          <input type="checkbox" checked={settings.showRms} onChange={(e) => update({ showRms: e.target.checked })} />
          Show RMS amplitude
        </label>
        <label className="checkbox-control">
          <input type="checkbox" checked={settings.autoWaveformGain} onChange={(e) => update({ autoWaveformGain: e.target.checked })} />
          Auto-fit waveform amplitude
        </label>
      </fieldset>
      <details className="analysis-notes">
        <summary>How to read the plots</summary>
        <p className="capture-note">
          Hann window · {(displayed.fftSize / sampleRate * 1000).toFixed(1)} ms ·
          {' '}{(sampleRate / displayed.fftSize).toFixed(1)} Hz bin spacing · 75% overlap.
          Changing analysis detail restarts spectral history.
        </p>
        <p className="capture-note">
          Displayed range: {displayed.minFrequency.toLocaleString()}–{displayed.maxFrequency.toLocaleString()} Hz,
          limited by Nyquist ({Math.round(sampleRate / 2).toLocaleString()} Hz).
          Color shows peak-amplitude spectrum, not power density. Blank regions have no complete analysis window.
        </p>
        <p className="capture-note">
          The waveform shows min/max at overview scale and individual samples at fine zoom.
          When “Auto-fit waveform amplitude” is on, the vertical axis scales to the loudest
          sample in the visible window (up to 100×, never below a -60 dBFS floor) so quiet
          signals stay readable; the input meter remains your dBFS reference. The optional
          yellow line is centered 20 ms RMS on the same scale.
          Both plots share sample-based time; 0 is the latest displayed sample,
          delayed by half an analysis window to align with the spectrum.
        </p>
        <p className="capture-note">
          Up to 30 seconds are retained while capturing. Pausing or stopping keeps a snapshot
          for inspection and export.
          This is an exploration tool, not a diagnostic or calibrated SPL instrument.
        </p>
      </details>
    </section>
  );
}
