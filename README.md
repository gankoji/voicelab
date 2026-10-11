# Voice Lab

An open-source, browser-first voice visualization app for singers exploring
their own voices.

**Status: project foundation.** The repository contains requirements, an
implementation design, a responsive React starter, and test/build tooling.
Microphone capture and audio analysis are not implemented yet. The starter
shows labeled placeholders, not simulated or measured audio.

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
Future microphone capture requires a secure context: localhost for desktop
development or HTTPS for deployment and testing from another device. A phone
visiting a plain HTTP LAN address is not equivalent to localhost.

```sh
npm run check          # Unit tests, strict TypeScript check, production build
npx playwright install chromium
npm run test:e2e       # Built-app smoke tests at desktop and mobile viewports
npm run preview       # Serve the production build locally
```

`npm run test:watch` starts unit tests in watch mode. `npm run typecheck` runs
only the compiler. Browser downloads are a separate, one-time setup step.
Mobile viewport tests are layout checks, not proof of mobile audio support.

## Design documents

- [Requirements and acceptance criteria](docs/requirements.md)
- [Architecture and implementation decisions](docs/architecture.md)
- [Milestones and scope](docs/roadmap.md)
- [Analysis validation plan](docs/analysis-validation.md)
- [Contributing](CONTRIBUTING.md)

The application uses TypeScript, React, and Vite. Planned audio processing uses
Web Audio, an AudioWorklet, a dedicated analysis worker, and Canvas 2D plots.
There is no backend. Offline loading is planned, not implemented.

## License

[MIT](LICENSE). Voice Lab is an independent project; it does not include
proprietary source code, branding, or assets from other voice-analysis products.
