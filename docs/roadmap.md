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

- [x] Freeze a stable snapshot while capture continues, and resume to live.
- [x] Pointer cursor inspection: time + frequency + approximate dB on the
      spectrogram, time + min/max amplitude on the waveform.
- [ ] Zoom/pan an immutable retained-history snapshot with reanalysis.
- [ ] WAV, plot image, and settings export from an explicit interval.
- [ ] Preference persistence, keyboard navigation, numeric readouts, color options.

Exit: a singer can start, sing, freeze, inspect, export, and stop unaided.
Current freeze/inspection is recorded in
[visualization validation](visualization-validation.md); full zoom/export remains.

## Phase 1D — release hardening and browser reach

WEB-01–02, OFF-01, OSS-01, SAFE-01.

- Actual Chromium/Firefox/Safari testing and published compatibility results.
- 30-minute soak and overload tests, documented latency measurements.
- Touch interactions and actual iOS Safari/Android Chrome validation.
- Offline asset loading, safe cache updates, static-host deployment guide.
- Dependency license review and privacy/network inspection.

Desktop may ship before mobile certification. Label mobile experimental until
it meets the same core workflow criteria; viewport emulation is insufficient.

## Phase 2A — F0 and musical pitch

PIT-01–03, ANA-01.

- Compare candidate trackers on tones, missing fundamentals, singing, noise,
  vibrato, slides, and voiced/unvoiced transitions.
- Select supported pitch range and measured accuracy/latency thresholds.
- Hz and confidence, spectrogram overlay, 12TET note/octave/cents, A4 tuning.
- Versioned analysis export and explicit invalid frames.

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
