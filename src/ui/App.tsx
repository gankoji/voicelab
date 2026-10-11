import { useRef, useState } from 'react';
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
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_VIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [frozen, setFrozen] = useState<FrozenView | null>(null);
  const [freezePending, setFreezePending] = useState(false);
  const freezeLock = useRef(false);

  const toggleFreeze = async () => {
    if (frozen) {
      setFrozen(null);
      return;
    }
    if (freezeLock.current || controller.getSnapshot().status !== 'running') return;
    freezeLock.current = true;
    setFreezePending(true);
    try {
      const snapshot = await controller.requestSnapshot();
      if (!snapshot || snapshot.samples.length === 0) return;
      const analysis = new FrozenAnalysis(snapshot.sampleRate, snapshot.samples, settings.fftSize);
      const liveFrame = controller.getView();
      const end = liveFrame ? Math.min(analysis.displayEnd, Math.max(0, liveFrame.endSample)) : analysis.displayEnd;
      const start = liveFrame ? Math.max(0, liveFrame.startSample) : Math.max(0, end - settings.historySeconds * snapshot.sampleRate);
      setFrozen({ analysis, start, end });
    } finally {
      freezeLock.current = false;
      setFreezePending(false);
    }
  };

  const updateFrozenRange = (start: number, end: number) => {
    setFrozen((current) => current ? { ...current, start, end } : current);
  };

  return (
    <main className={settingsOpen ? 'app settings-open' : 'app'}>
      <header className="app-header">
        <h1>Voice Lab</h1>
        <span>{frozen ? 'Frozen · live capture continues' : 'Live voice analysis'}</span>
      </header>

      <MicrophonePanel
        controller={controller}
        settingsOpen={settingsOpen}
        onSettingsChange={setSettingsOpen}
        frozen={frozen !== null}
        freezePending={freezePending}
        onFreezeToggle={() => void toggleFreeze()}
      >
        <DisplaySettings controller={controller} settings={settings} onChange={setSettings} frozen={frozen !== null} />
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
