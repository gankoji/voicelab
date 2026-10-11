import { useState } from 'react';
import { CaptureController } from '../audio/capture-controller';
import { MicrophonePanel } from './MicrophonePanel';
import { VisualizationPanel } from './VisualizationPanel';

export function App() {
  const [controller] = useState(() => new CaptureController());
  return (
    <main className="app">
      <header className="intro">
        <p className="eyebrow">An open-source workspace for your voice</p>
        <h1>Voice Lab</h1>
        <p className="lede">
          Explore the shape, pitch, and resonance of your singing.
          Built for your browser, designed to keep your audio on your device.
        </p>
      </header>

      <aside className="status" aria-label="Development status">
        <span className="badge">Live visualization milestone</span>
        <p>
          Sing or speak to explore your spectrum and waveform.
          Freezing, inspection, and exports are still in development.
        </p>
      </aside>

      <MicrophonePanel controller={controller} />
      <VisualizationPanel controller={controller} />

      <section className="next-phase" aria-labelledby="tracking-heading">
        <div>
          <p className="eyebrow">Required · Phase 2</p>
          <h2 id="tracking-heading">Pitch and resonance tracking</h2>
        </div>
        <p>
          F0 frequency, musical note and cents in 12-tone equal temperament,
          plus F1–F3 formant estimates with uncertainty shown.
        </p>
      </section>

      <footer>
        Made for exploration, not diagnosis. Digital levels are not calibrated sound pressure levels.
      </footer>
    </main>
  );
}
