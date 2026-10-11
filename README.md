# Voice Lab

An open-source, browser-first voice visualization app for singers exploring
their own voices.

**Status: live visualization milestone.** Microphone capture, a scrolling
spectrogram, synchronized detailed waveform, optional RMS overlay, input levels,
near-clipping warnings, and capture-settings reporting work. Processing and a
bounded recent-audio buffer stay on your device; no audio is saved or uploaded.
Freezing, cursor inspection, exports, pitch, and formant analysis are not
implemented yet.

## Planned capabilities

- **Phase 1:** real-time spectrogram and synchronized detailed waveform,
  optional RMS, microphone controls, freeze/zoom/inspect, WAV and image exports.
- **Phase 2 (required):** F0 tracking, 12TET note/octave/cents with adjustable
  tuning reference, and F1–F3 formant tracking with explicit uncertainty.
- Local processing without accounts, audio uploads, or telemetry. Desktop
  browsers first; phone/tablet browser support will require real-device tests.

This is an exploration tool, not a medical device. Digital amplitude is not
calibrated sound pressure level, and pitch/formant estimates have limitations.

## Develop

Use Node.js 24.15 or newer within the 24.x line (recommended), or Node.js 26+,
and npm. With nvm installed, `nvm install` selects the version in `.nvmrc`.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The server binds to loopback by default.
Microphone capture requires a secure context: localhost for desktop
development or HTTPS for deployment and testing from another device. A phone
visiting a plain HTTP LAN address is not equivalent to localhost.

Open the app and press **Record** to begin live analysis. The spectrogram and
waveform fill most of the window; a compact toolbar shows capture status and
peak/RMS level readouts. Use **Settings** to choose an input or adjust the plots.
**Pause** freezes the view for inspection while capture continues; **Stop**
releases the microphone and keeps a snapshot you can still inspect. Selecting
another input stops capture until you explicitly record again. Capture also
stops when the page is hidden or left; it never resumes automatically.

While paused or stopped, scroll or drag on the spectrogram to zoom and pan, and
hover (or use the arrow keys while the plot is focused) to read time, frequency,
and amplitude. **Export** downloads the paused interval as a WAV file, a composite
PNG of the two plots, and a JSON sidecar. Display settings and the chosen input
persist in localStorage between sessions; audio and microphone consent never do.

Analysis requests a 48 kHz AudioContext; Web Audio resamples inputs as needed.
The details distinguish input and analysis rates. Both plots are delayed by
half an FFT window to align waveform samples with centered spectral estimates.

Processing-off requests are best effort: hardware/OS processing may still apply.
The near-clipping warning means a digital sample reached -0.1 dBFS or higher;
it cannot detect every instance of analog distortion. There is no speaker
monitoring, so you should not hear delayed playback.

```sh
npm run check          # Unit tests, strict TypeScript check, production build, license audit
npx playwright install chromium
npm run test:e2e       # Built-app capture tests with a synthetic microphone
npm run test:e2e:dev   # Same workflows against the Vite development server
npx playwright install firefox webkit
npm run test:browsers  # Firefox + WebKit loading/layout smoke (no microphone)
npm run benchmark:analysis # Accelerated 30-minute DSP/retention check, not a live-browser soak
npm run soak -- 600    # Real-browser liveness/heap probe for 600 seconds
npm run preview       # Serve the production build locally
```

`npm run test:watch` starts unit tests in watch mode. `npm run typecheck` runs
only the compiler. Browser downloads are a separate, one-time setup step.
Run browser suites sequentially; each owns test port 4173. Browser tests use
Chromium with synthetic audio, never your physical microphone. Phone-sized
viewport tests are not proof of mobile hardware/browser support.

## Design documents

- [Requirements and acceptance criteria](docs/requirements.md)
- [Architecture and implementation decisions](docs/architecture.md)
- [Milestones and scope](docs/roadmap.md)
- [Analysis validation plan](docs/analysis-validation.md)
- [Capture validation and manual checklist](docs/capture-validation.md)
- [Visualization semantics and validation](docs/visualization-validation.md)
- [Release hardening and compatibility](docs/release-hardening.md)
- [Deployment](docs/deployment.md)
- [Contributing](CONTRIBUTING.md)

The application uses TypeScript, React, Vite, Web Audio, an AudioWorklet,
a dedicated analysis worker, fft.js, and Canvas 2D plots. There is no backend.
Production builds register a service worker that caches application assets for
offline loading; audio is never cached or uploaded.

## License

[MIT](LICENSE). Voice Lab is an independent project; it does not include
proprietary source code, branding, or assets from other voice-analysis products.
Runtime dependencies (React, scheduler, fft.js) are MIT; their attribution is
preserved in [third-party notices](public/third-party-notices.txt), included in
production builds.
