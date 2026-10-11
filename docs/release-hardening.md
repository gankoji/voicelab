# Release hardening

Recorded evidence and procedures for the browser/privacy/licensing items of
Phase 1D. Physical-device and end-to-end latency measurements remain manual gates.

## Browser compatibility

Automated on this machine (Playwright):

| Engine | What is automated | Result |
| --- | --- | --- |
| Chromium (desktop + phone viewport) | Full workflow: capture, tone analysis, plots, pause/zoom/pan, export, preferences, offline | `npm run test:e2e` and `npm run test:e2e:dev` pass |
| Firefox (desktop) | Loading and layout smoke | `npm run test:browsers` passes |
| WebKit (desktop, built as Playwright's Safari) | Loading and layout smoke | `npm run test:browsers` passes |

Microphone capture in Firefox and Safari, and any real-mobile behavior, are not
covered by the automated suite because Playwright's synthetic microphone is
Chromium-only. Run the manual checklist before claiming mobile/other-browser
capture support.

```sh
npx playwright install firefox webkit chromium
npm run test:browsers
```

## Network and privacy inspection

`tests/browser/privacy.spec.ts` drives a full capture → pause → export cycle and
asserts that every observed request is same-origin, uses GET, and carries no
body. Audio stays in volatile worker/main-thread memory unless the user exports
a file; no analytics, accounts, or cross-origin runtime calls exist.

## License review

Runtime (bundled) dependencies and their licenses are audited with
`npm run check:licenses`, which fails on anything outside MIT/BSD/Apache/ISC/0BSD.
The current runtime packages (React, React DOM, scheduler, fft.js) are all MIT;
devDependencies are not distributed. Attribution is shipped in the production
build via `public/third-party-notices.txt`.

## Soak and memory

`npm run soak -- <seconds>` builds and serves the production app, records a
synthetic 440 Hz tone in a real Chromium instance, and samples the renderer JS
heap with `Runtime.getHeapUsage` while confirming capture stays live. A 12-second
run on macOS arm64 kept dropped samples at 0 and the heap within a few MB.

This is a real-browser liveness/memory probe, not the full 30-minute physical
soak. For a release gate, run `npm run soak -- 1800` and additionally watch the
operating system's memory tools; dropped samples should remain near zero and the
heap should plateau rather than grow. Configuration of the fake capture (its
looping 2-second file) means the DSP does not reflect real voice statistics, so
treat it as a structural check, not an audio-quality check.

## End-to-end latency methodology

The worker-side/raster cost is covered by `npm run benchmark:analysis`. For the
end-to-end sound-to-display number, do not trust wall-clock guesses:

1. Route a known click/impulse into the microphone input (or use a loopback with
   a visible source) and record it on camera with the screen in frame.
2. Note the moment the input event is visible/audible and the frame where the
   spectrogram/waveform first reflects it.
3. Compute latency as the frame-to-frame time difference, and report median and
   95th percentile across several trials, alongside the browser/OS, device,
   sample rate, FFT/hop settings, and visible-history settings used.
4. Compare against the documented target (≤150 ms at default settings). Do not
   treat worker processing time as equivalent to end-to-end latency.

## Offline loading

A service worker (`public/sw.js`) is registered only in production builds and
caches same-origin application assets. Navigations are network-first (so new
deploys update) with a cache fallback; hashed assets are cache-first. It never
intercepts or stores audio. See `tests/browser/offline.spec.ts` for the automated
check and [deployment](deployment.md) for serving requirements.

## Deployment

See [deployment](deployment.md) for static hosting, HTTPS, and build steps.
