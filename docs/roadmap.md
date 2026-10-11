# Roadmap

The first release is the live observation workflow. Pitch and formant tracking
are required Phase 2 capabilities, not optional backlog ideas.

## Foundation — completed

- [x] Requirements, architecture, validation plan, and milestone sequence.
- [x] MIT license and contributor/development documentation.
- [x] TypeScript/React/Vite starter with explicit development placeholders.
- [x] Unit, build/typecheck, and browser smoke-test configuration.

## Phase 1A — capture proof of concept, baseline confirmed

CAP-01–05, PRIV-01.

- [x] Explicit start/stop, permission recovery, input enumeration/selection.
- [x] Report actual sample rate and browser-reported processing settings.
- [x] Worklet batching and bounded worker transport; input peak/RMS/clipping meter.
- [x] Lifecycle tests, including stop during a pending permission request.
- [x] Synthetic-microphone Chromium tests against both built app and dev server.
- [x] Project owner ran the capture milestone and confirmed its behavior.
- [ ] Establish reference hardware; certify other browsers and real mobile devices.

Exit: real microphone levels work without speaker feedback, capture resources
are released reliably, and input discontinuities are recorded.
Current evidence and manual steps: [capture validation](capture-validation.md).

## Phase 1B — analysis vertical slice, implemented for manual validation

VIS-01–05, BUF-01, PERF-01–02.

- [x] Select and test FFT implementation and normalization.
- [x] Synthetic tone → worker → spectrogram and waveform.
- [x] Add microphone input using the same pipeline.
- [x] Shared sample-based timeline, min/max waveform summaries, optional RMS.
- [x] Bounded history, visible gaps, usable timing/detail presets.
- [x] Real canvas checks for tone placement, RMS, time alignment, and fine zoom.
- [x] Accelerated 30-minute DSP/history check (not a real-time browser soak).
- [ ] Singer walkthrough of vowel, slide, volume changes, and waveform detail.

Exit: synthetic tests validate coordinates/levels; a real sustained vowel,
pitch slide, and volume change produce correctly synchronized views.
Evidence and manual steps: [visualization validation](visualization-validation.md).

## Phase 1C — usable live workflow

INS-01–02, EXP-01–02, SET-01, ACC-01.

- [x] Pause a stable snapshot while capture continues, and resume to live.
- [x] Pointer cursor inspection: time + frequency + approximate dB on the
      spectrogram, time + min/max amplitude on the waveform.
- [x] Zoom/pan an immutable retained-history snapshot (scroll to zoom, drag to
      pan), re-analyzed from copied raw audio; also retained after recording stops.
- [x] WAV audio, a settings/analysis JSON sidecar, and a composite PNG image
      export of the paused or stopped interval.
- [x] Local persistence of display settings and the chosen input device, with
      no audio or microphone consent ever stored.
- [x] Alternate color palettes (viridis, magma, grayscale) and keyboard
      navigation of a paused view (arrows move the cursor, Shift+arrows pan,
      +/- zoom, Home/End reset).

Exit: a singer can start, sing, pause, inspect, export, and stop unaided.
Current pause/inspection/export behavior is recorded in
[visualization validation](visualization-validation.md).

## Phase 1D — release hardening and browser reach

WEB-01–02, OFF-01, OSS-01, SAFE-01.

- [x] Chromium automation covers capture/plots/pause/export; Firefox and WebKit
      desktop pass the loading and layout smoke (`npm run test:browsers`).
- [x] Real-browser soak harness (`npm run soak -- <seconds>`) samples the JS heap
      and verifies liveness/dropped samples; latency methodology documented.
- [ ] Physical hardware: microphone capture in Firefox/Safari, touch on real
      iOS Safari/Android Chrome, and an actual 30-minute/latency measurement.
- [x] Production service worker caches application assets for offline loads;
      static HTTPS deployment guide documented.
- [x] Runtime dependency license audit (`npm run check:licenses`, all MIT) and an
      automated privacy/network inspection.

Desktop may ship before mobile certification. Label mobile experimental until
it meets the same core workflow criteria; viewport emulation is insufficient.
Evidence and procedures: [release hardening](release-hardening.md).

## Phase 2A — F0 and musical pitch

PIT-01–03, ANA-01.

- [x] Implemented YIN with an absolute-threshold valley-minimum refinement, plus
      a streaming tracker that emits voiced/unvoiced points without bridging gaps.
- [x] 12TET note/octave/cents conversion with an adjustable A4 reference;
      scientific-pitch octave convention (MIDI 60 = C4).
- [x] Live spectrogram F0 overlay and a note/cents/Hz readout, gated by confidence.
- [x] Synthetic fixtures: tones, missing fundamental, silence/noise, vibrato,
      discontinuities, and reference-agnostic 12TET boundaries.
- [x] Benchmark against McLeod pitch detection: both were equivalent on synthetic
      tones/harmonics/vibrato/noise (≤1.3¢ error); YIN stays as the integrated choice.
- [x] Timestamped pitch data in exports, plus a frozen-snapshot pitch overlay.
- [ ] Real-voice accuracy/latency/vibrato validation on published hardware.

Exit: published validation shows useful singing performance without hiding
uncertainty or smoothing away expressive pitch changes.

## Phase 2B — formants

FOR-01–02, ANA-01.

- Evaluate LPC-based estimation and alternatives if LPC fails the target cases.
- Validate synthetic resonances and licensed annotated reference material.
- Track F1–F3 with bandwidth/plausibility checks and temporal association.
- Show gaps/uncertainty and explain high-F0 limitations.

Exit: supported conditions and error/rejection behavior are documented and
tested; unreliable estimates are not presented as measured facts.

## Outside these phases

Playback, importing files, comparison takes, calibrated SPL, native packaging,
multichannel/system audio, health or technique scoring, cloud features.
