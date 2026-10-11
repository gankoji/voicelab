# Roadmap

The first release is the live observation workflow. Pitch and formant tracking
are required Phase 2 capabilities, not optional backlog ideas.

## Foundation — this change

- [x] Requirements, architecture, validation plan, and milestone sequence.
- [x] MIT license and contributor/development documentation.
- [x] TypeScript/React/Vite starter with explicit development placeholders.
- [x] Unit, build/typecheck, and browser smoke-test configuration.
- [ ] Microphone capture or DSP (intentionally not part of the foundation).

## Phase 1A — capture proof of concept

CAP-01–04, PRIV-01.

- Explicit start/stop, permission recovery, input enumeration/selection.
- Report actual sample rate and browser-reported processing settings.
- Worklet batching and bounded worker transport; input peak/RMS/clipping meter.
- Lifecycle tests, including stop during a pending permission request.
- Establish desktop reference hardware and secure-context deployment setup.

Exit: real microphone levels work without speaker feedback, capture resources
are released reliably, and input discontinuities are recorded.

## Phase 1B — analysis vertical slice

VIS-01–05, BUF-01, PERF-01–02.

- Select and test FFT implementation and normalization.
- Synthetic tone → worker → spectrogram and waveform.
- Add microphone input using the same pipeline.
- Shared sample-based timeline, min/max waveform summaries, optional RMS.
- Bounded history, visible gaps, usable timing/detail presets.

Exit: synthetic tests validate coordinates/levels; a real sustained vowel,
pitch slide, and volume change produce correctly synchronized views.

## Phase 1C — usable live workflow

INS-01–02, EXP-01–02, SET-01, ACC-01.

- Immutable freeze snapshot, zoom/pan/cursor inspection and live resume.
- WAV, plot image, and settings export from an explicit interval.
- Preference persistence, keyboard navigation, numeric readouts, color options.

Exit: a singer can start, sing, freeze, inspect, export, and stop unaided.

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
