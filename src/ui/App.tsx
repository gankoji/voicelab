import { useRef, useState, useSyncExternalStore } from 'react';
import { CaptureController } from '../audio/capture-controller';
import { DEFAULT_VIEW } from '../analysis/view';
import type { ViewSettings } from '../analysis/view';
import { FrozenAnalysis } from '../analysis/frozen-analysis';
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
      >
        <DisplaySettings controller={controller} settings={settings} onChange={handleSettingsChange} frozen={frozen !== null} />
      </MicrophonePanel>

      <VisualizationPanel
        controller={controller}
        settings={settings}
        frozen={frozen}
        onFrozenRangeChange={updateFrozenRange}
      />

      <footer>
        <span>Audio stays on this device. Nothing is saved.</span>
        <span>Live analysis only · exports coming later</span>
      </footer>
    </main>
  );
}
