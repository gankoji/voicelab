import { useState } from 'react';
import { CaptureController } from '../audio/capture-controller';
import { DEFAULT_VIEW } from '../analysis/view';
import type { PlotFrame } from '../analysis/view';
import { MicrophonePanel } from './MicrophonePanel';
import { VisualizationPanel } from './VisualizationPanel';
import { DisplaySettings } from './DisplaySettings';

export function App() {
  const [controller] = useState(() => new CaptureController());
  const [settings, setSettings] = useState(DEFAULT_VIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<PlotFrame | null>(null);

  const toggleFreeze = () => {
    if (frozenFrame) {
      setFrozenFrame(null);
    } else if (controller.getSnapshot().status === 'running') {
      const frame = controller.getView();
      if (frame) setFrozenFrame(frame);
    }
  };

  return (
    <main className={settingsOpen ? 'app settings-open' : 'app'}>
      <header className="app-header">
        <h1>Voice Lab</h1>
        <span>{frozenFrame ? 'Frozen · live capture continues' : 'Live voice analysis'}</span>
      </header>

      <MicrophonePanel
        controller={controller}
        settingsOpen={settingsOpen}
        onSettingsChange={setSettingsOpen}
        frozen={frozenFrame !== null}
        onFreezeToggle={toggleFreeze}
      >
        <DisplaySettings controller={controller} settings={settings} onChange={setSettings} />
      </MicrophonePanel>

      <VisualizationPanel controller={controller} settings={settings} frozenFrame={frozenFrame} />

      <footer>
        <span>Audio stays on this device. Nothing is saved.</span>
        <span>Live analysis only · exports coming later</span>
      </footer>
    </main>
  );
}
