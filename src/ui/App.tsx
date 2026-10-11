export function App() {
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
        <span className="badge">Project foundation</span>
        <p>
          This is the application starter, not a working analyzer yet.
          Microphone capture, live plots, freezing, and exports are next.
        </p>
        <p className="privacy">Microphone inactive — no audio is being captured.</p>
      </aside>

      <section className="workspace" aria-label="Planned visualization workspace">
        <section className="panel" aria-labelledby="spectrogram-heading">
          <div className="panel-heading">
            <h2 id="spectrogram-heading">Spectrogram</h2>
            <span>Planned · Phase 1</span>
          </div>
          <div className="plot-placeholder">
            <p>See the frequencies in your voice unfold over time.</p>
            <p className="plot-detail">
              Frequency × time · color shows spectral level
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="waveform-heading">
          <div className="panel-heading">
            <h2 id="waveform-heading">Waveform</h2>
            <span>Planned · Phase 1</span>
          </div>
          <div className="plot-placeholder waveform-placeholder">
            <p>Inspect individual wave cycles, or zoom out for the whole phrase.</p>
            <p className="plot-detail">
              Amplitude × time · optional RMS level · synchronized with the spectrogram
            </p>
          </div>
        </section>
      </section>

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
