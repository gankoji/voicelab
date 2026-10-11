import { useRef, useState, useSyncExternalStore } from 'react';
import { CaptureController } from '../audio/capture-controller';
import { DEFAULT_VIEW } from '../analysis/view';
import type { ViewSettings } from '../analysis/view';
import { FrozenAnalysis } from '../analysis/frozen-analysis';
import { buildMetadata, downloadBlob, encodeWav } from '../export/export';
import { encodePlotPng } from '../export/image';
import { APP_NAME, APP_VERSION } from '../app-meta';
import { MicrophonePanel } from './MicrophonePanel';
import { VisualizationPanel } from './VisualizationPanel';
import { DisplaySettings } from './DisplaySettings';

export interface FrozenView {
  analysis: FrozenAnalysis;
  start: number;
  end: number;
}

export function App() {
  const [controller] = useState(() => new CaptureController());
  const capture = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_VIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [frozen, setFrozen] = useState<FrozenView | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const pauseLock = useRef(false);
  const spectralCanvas = useRef<HTMLCanvasElement | null>(null);
  const waveCanvas = useRef<HTMLCanvasElement | null>(null);

  const captureSnapshot = async () => {
    const snapshot = await controller.requestSnapshot();
    if (!snapshot || snapshot.samples.length === 0) return null;
    const analysis = new FrozenAnalysis(snapshot.sampleRate, snapshot.samples, settings.fftSize);
    const liveFrame = controller.getView();
    const end = liveFrame ? Math.min(analysis.displayEnd, Math.max(0, liveFrame.endSample)) : analysis.displayEnd;
    const start = liveFrame ? Math.max(0, liveFrame.startSample) : Math.max(0, end - settings.historySeconds * snapshot.sampleRate);
    return { analysis, start, end } satisfies FrozenView;
  };

  const togglePause = async () => {
    if (pauseLock.current || capture.status !== 'running') return;
    if (frozen) {
      setFrozen(null);
      return;
    }
    pauseLock.current = true;
    setPausePending(true);
    try {
      const view = await captureSnapshot();
      if (view) setFrozen(view);
    } finally {
      pauseLock.current = false;
      setPausePending(false);
    }
  };

  const stopRecording = async () => {
    if (capture.status !== 'running') {
      controller.stop();
      return;
    }
    if (!frozen) {
      try {
        const view = await captureSnapshot();
        if (view) setFrozen(view);
      } catch {
        // Still release the microphone even if the snapshot could not be read.
      }
    }
    controller.stop();
  };

  const updateFrozenRange = (start: number, end: number) => {
    setFrozen((current) => current ? { ...current, start, end } : current);
  };

  const handleSettingsChange = (next: ViewSettings) => {
    const historyChanged = next.historySeconds !== settings.historySeconds;
    setSettings(next);
    if (frozen && historyChanged) {
      setFrozen((current) => current && {
        ...current,
        start: Math.max(0, current.analysis.displayEnd - next.historySeconds * current.analysis.sampleRate),
        end: current.analysis.displayEnd,
      });
    }
  };

  const startRecording = (deviceId: string) => {
    setFrozen(null);
    void controller.start(deviceId);
  };

  const exportSnapshot = async () => {
    if (!frozen) return;
    const audio = frozen.analysis.slice(frozen.start, frozen.end);
    const wav = encodeWav(audio, frozen.analysis.sampleRate);
    const metadata = buildMetadata({
      app: APP_NAME, version: APP_VERSION, exportedAt: new Date().toISOString(),
      sampleRate: frozen.analysis.sampleRate,
      startSample: frozen.start, endSample: frozen.end, sampleCount: audio.length,
      settings,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([wav], { type: 'audio/wav' }), `${APP_NAME}-${stamp}.wav`);
    downloadBlob(new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }), `${APP_NAME}-${stamp}.json`);
    if (spectralCanvas.current && waveCanvas.current) {
      try {
        const png = await encodePlotPng(spectralCanvas.current, waveCanvas.current);
        downloadBlob(png, `${APP_NAME}-${stamp}.png`);
      } catch {
        // Audio and metadata already downloaded; a plot-image failure should not block them.
      }
    }
  };

  const headerText = frozen
    ? (capture.status === 'running' ? 'Paused · live capture continues' : 'Paused · recording stopped')
    : 'Live voice analysis';

  return (
    <main className={settingsOpen ? 'app settings-open' : 'app'}>
      <header className="app-header">
        <h1>Voice Lab</h1>
        <span>{headerText}</span>
      </header>

      <MicrophonePanel
        controller={controller}
        settingsOpen={settingsOpen}
        onSettingsChange={setSettingsOpen}
        frozen={frozen !== null}
        pausePending={pausePending}
        onPauseToggle={() => void togglePause()}
        onStop={() => void stopRecording()}
        onRecord={startRecording}
        onExport={() => void exportSnapshot()}
      >
        <DisplaySettings controller={controller} settings={settings} onChange={handleSettingsChange} frozen={frozen !== null} />
      </MicrophonePanel>

      <VisualizationPanel
        controller={controller}
        settings={settings}
        frozen={frozen}
        onFrozenRangeChange={updateFrozenRange}
        spectralCanvas={spectralCanvas}
        waveCanvas={waveCanvas}
      />

      <footer>
        <span>Audio stays on this device. Nothing is saved.</span>
        <span>Pause or stop to export WAV and settings</span>
      </footer>
    </main>
  );
}
