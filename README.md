# Voice Lab

An open-source, browser-first voice visualization app for singers exploring
their own voices.

**Status: microphone capture milestone.** Start/stop, input selection, live
peak/RMS levels, near-clipping warnings, and capture-settings reporting work.
Audio travels through an AudioWorklet to a dedicated worker; no audio is saved
or uploaded. The spectrogram and waveform panels remain labeled placeholders.
Freezing, exports, pitch, and formant analysis are not implemented yet.

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

Choose an input, press **Start microphone**, and allow browser microphone access.
Sing or speak to watch peak and RMS levels; expand **Capture details and
processing** to inspect reported settings and sample counters. Selecting another
input stops capture until you explicitly start it again. Capture also stops
when the page is hidden or left; it never resumes automatically.

Processing-off requests are best effort: hardware/OS processing may still apply.
The near-clipping warning means a digital sample reached -0.1 dBFS or higher;
it cannot detect every instance of analog distortion. There is no speaker
monitoring, so you should not hear delayed playback.

```sh
npm run check          # Unit tests, strict TypeScript check, production build
npx playwright install chromium
npm run test:e2e       # Built-app capture tests with a synthetic microphone
npm run test:e2e:dev   # Same workflows against the Vite development server
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
- [Contributing](CONTRIBUTING.md)

The application uses TypeScript, React, Vite, Web Audio, an AudioWorklet, and a
dedicated analysis worker. Canvas 2D plots are next. There is no backend.
Offline loading is planned, not implemented.

## License

[MIT](LICENSE). Voice Lab is an independent project; it does not include
proprietary source code, branding, or assets from other voice-analysis products.
