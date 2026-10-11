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
peak/RMS levels. Use **Settings** to choose an input or adjust the plots; use
**Stop** to release the microphone. Selecting another input stops capture until
you explicitly record again. Capture also stops when the page is hidden or left;
it never resumes automatically.

The plots share a scrolling time axis. In **Settings**, under Display, choose:

- Visible history from 5 ms (sample detail on sufficiently wide screens) to 30 s.
- Linear/log frequency scale and frequency limits.
- Timing/balanced/frequency-detail analysis presets.
- Fixed color floor and ceiling; optional centered 20 ms RMS on the waveform.

Try a sustained vowel and a pitch slide. For a closer look at the waveform,
choose 20 ms or 5 ms. Changing analysis detail restarts spectral history;
display-only controls redraw the retained history. Stopping discards the
rolling audio buffer but leaves the last view onscreen. This is not yet the
freeze/inspection feature.

Analysis requests a 48 kHz AudioContext; Web Audio resamples inputs as needed.
The details distinguish input and analysis rates. Both plots are delayed by
half an FFT window to align waveform samples with centered spectral estimates.

Processing-off requests are best effort: hardware/OS processing may still apply.
The near-clipping warning means a digital sample reached -0.1 dBFS or higher;
it cannot detect every instance of analog distortion. There is no speaker
monitoring, so you should not hear delayed playback.

```sh
npm run check          # Unit tests, strict TypeScript check, production build
npx playwright install chromium
npm run test:e2e       # Built-app capture tests with a synthetic microphone
npm run test:e2e:dev   # Same workflows against the Vite development server
npm run benchmark:analysis # Accelerated 30-minute DSP/retention check, not a live-browser soak
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
- [Contributing](CONTRIBUTING.md)

The application uses TypeScript, React, Vite, Web Audio, an AudioWorklet,
a dedicated analysis worker, fft.js, and Canvas 2D plots. There is no backend.
Offline loading is planned, not implemented.

## License

[MIT](LICENSE). Voice Lab is an independent project; it does not include
proprietary source code, branding, or assets from other voice-analysis products.
The FFT dependency's license is preserved in
[third-party notices](public/third-party-notices.txt), included in production builds.
