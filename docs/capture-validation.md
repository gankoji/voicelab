# Capture milestone validation

This records the capture baseline, which the project owner has now run and
confirmed. The subsequent [visualization milestone](visualization-validation.md)
adds history/plots, requests 48 kHz analysis, and uses eight 1024-sample blocks
instead of four 2048-sample blocks (same total pool size). The statements below
about unimplemented plots/no history describe that earlier baseline.

## Implemented

Explicit microphone start/stop, input enumeration/selection, permission/error
recovery, reported capture settings, live peak/RMS in dBFS, near-clipping warning,
and dropped-sample counters. The app requests disabled AGC, echo cancellation,
and noise suppression, but reports actual/unknown state without promising a
completely raw hardware path.

Capture uses a mono AudioWorklet with silent output, a direct MessagePort to
a worker, four reusable 2048-sample buffers, and sample-position timestamps.
No sample history is retained in this milestone. Spectrogram, waveform,
freeze/export, and pitch/formant analysis remain unimplemented.

## Automated evidence

Run:

```sh
npm run check
npm run test:e2e
npm run test:e2e:dev
```

Unit tests cover:

- Full-scale/silence references, known sine levels at 44.1/48 kHz, sample-weighted
  RMS across unequal batches, interval reset, and near-clipping hold.
- Buffer reuse, overload without growing the audio queue, and gaps without
  incorrectly joining partial blocks.
- Worklet output silence, correct startup origin, and later discontinuities.
- Requested constraints versus actual settings.
- Cancellation while permission or worker startup is pending; stale-session
  failures and results; permission/device errors; worklet module failure.
- Worker timeout, track mute/end, processor/worker error, context suspension,
  bounded summary requests, and sample-stall cleanup.

Chromium browser tests use a generated two-second 440 Hz sine at 0.25 peak
amplitude, via Chromium's synthetic microphone. They exercise the real
getUserMedia → AudioWorklet → worker pipeline and verify approximately
-12.04 dBFS peak and -15.05 dBFS RMS (display tolerance 0.5 dB).

Both production and Vite development builds are tested at desktop and
phone-sized viewports. Tests cover start/stop/restart, actual ended tracks,
input selection, pagehide, no automatic capture after reload, and error-free
rendering. Permission denial is an injected DOMException because Chromium's
fake-permission flag bypasses actual permission UI; retry uses real synthetic
capture. A request check rejects cross-origin or non-GET traffic during the
production capture workflow.

Browser scheduling can produce dropped samples under parallel load. Tests
require the count and visible warning to agree, rather than assuming a real-time
OS scheduling guarantee. The buffer tests separately verify exact ordering and
gap accounting.

## Not yet established

- Physical microphone behavior, OS permission prompts, or calibrated accuracy.
- Firefox/Safari support or real iOS/Android audio behavior.
- End-to-end latency target, 30-minute memory/queue soak, or reference hardware.
- STFT, pitch, or formant accuracy.

The automated environment is macOS arm64 with Playwright's bundled Chromium;
CI is configured for Linux but local success is not evidence that CI has run.
Mobile viewport emulation is not actual Android/iOS coverage.

## Manual checklist

From the primary checkout after the milestone is synced:

```sh
cd ~/Projects/voice-lab
npm ci
npm run dev
```

1. Open the printed localhost URL. Confirm no permission prompt or active
   microphone appears before pressing **Start microphone**.
2. Start, allow microphone access, and speak/sing. Peak and RMS should move.
   You should not hear delayed playback from this app.
3. Expand **Capture details and processing**. Check input, analysis sample rate,
   reported processing, and advancing sample count. Unknown processing is valid.
4. Vary your volume or input gain moderately. Do not shout to test the clipping
   warning; synthetic tests cover that threshold.
5. Stop. Confirm the browser's active-capture indicator goes away and readings
   clear. The browser may retain permission without retaining active capture.
6. Repeat start/stop, then select a different input if one is available.
   Selection should stop capture and require another explicit start.
7. Switch to another tab and return. Capture should be stopped with an
   explanation, not automatically resumed.
8. Separately deny permission, then re-enable it in site/system settings and
   retry. Disconnect an external mic if available; recover through input
   selection and start, without reloading.

Record browser/OS versions, microphone, processing settings, and any unexpected
behavior. Do not share recordings unless you explicitly intend to.
