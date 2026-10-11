# Analysis validation plan

Status: future DSP acceptance plan, not a report of current accuracy.
Current tests cover capture lifecycle, bounded sample transport, digital
peak/RMS, and browser capture workflows; see [capture validation](capture-validation.md).
Spectral/tracking tolerances must be set before those features are accepted.

## Reproducible fixtures

Generate fixtures from explicit sample rate, duration, amplitude, frequency,
phase, envelope, harmonic structure, and seeded noise. Exercise at least
44.1 kHz and 48 kHz, different batch boundaries, and non-bin-centered tones.
Keep the reference generator independent enough from production DSP to avoid
testing an implementation against its own mistakes.

Prefer synthetic audio. Any human reference recordings need consent,
redistribution terms, provenance, and a documented annotation method.
Do not treat another analyzer's output as unquestionable ground truth.

| Test | Expected evidence | Requirements |
| --- | --- | --- |
| Silence | Finite rendering, no false pitch, documented display floor; RMS handles zero without NaN. | CAP-04, VIS-05, PIT-01 |
| 440 Hz sine | Peak near expected bin within documented STFT tolerance; verify leakage for off-bin tone. | VIS-01 |
| Harmonic series | Correct spacing, relative levels under chosen window/normalization. | VIS-01, VIS-05 |
| Sweep | Continuous trace; no invented discontinuities at batch boundaries. | VIS-01, PERF-02 |
| Half amplitude | Time-domain level changes by approximately -6.0206 dB; peak and RMS references tested independently. | CAP-04, VIS-03 |
| Impulse/transient | Peaks survive overview waveform reduction; aligned views within one analysis hop. | VIS-02, PERF-02 |
| Full scale/overrange | Documented near-clipping threshold; exports follow encoding/clipping policy. | CAP-04, EXP-01 |
| Buffer wrap | Exact retained sample interval, ordered columns, immutable frozen snapshot. | BUF-01, INS-01 |
| Interrupted stream | Sample gaps remain gaps, not interpolated “live” data. Stale session results are ignored. | CAP-02, PERF-02 |
| WAV/image export | Decode WAV to check sample count/rate/levels; image and settings match selected snapshot. | EXP-01–02 |
| F0 tone/range sweep | Pitch error in cents, octave-error rate, latency across declared pitch range. | PIT-01–02 |
| Missing fundamental | Correct periodicity despite weak/absent first harmonic. | PIT-01 |
| Vibrato/slide | Quantify modulation preservation, tracking lag, and octave jumps. | PIT-03 |
| Noise/breathiness | Voicing precision/recall, confidence/rejection behavior, not only accepted-frame accuracy. | PIT-01, FOR-02 |
| 12TET conversion | A4, C4, octave boundaries, half-step ties, alternate reference, invalid inputs. | PIT-02 |
| Synthetic source/filter vowel | Known pole/resonance frequencies and bandwidths; report F1–F3 errors and rejected-frame coverage. | FOR-01–02 |
| Increasing F0 | Same filter across source pitches: show where sparse harmonics make formants unreliable. | FOR-02 |

## Browser integration and privacy

- Permission granted/denied, no input, device removal/switch, context suspension,
  page backgrounding, stop during permission request, repeated start/stop.
- Inspect capture constraints and reported settings without equating them with
  proof of a completely unprocessed hardware path.
- Verify no speaker feedback and explicit capture status while frozen.
- Inspect network traffic during capture, freeze, export, and offline use.
  Application asset requests are expected; audio uploads and telemetry are not.
- Verify keyboard and touch workflows, text zoom, color contrast, units, and
  that capture can always be stopped.

## Performance and compatibility record

Record hardware, OS/browser version, input device, sample rate, FFT/hop sizes,
buffer lengths, and visible history with each result.

Measure sound-to-display latency with a reproducible input event and visual
observation/instrumentation; worker processing time alone is not end-to-end
latency. Report a distribution (including median and 95th percentile), display
frame cadence, analysis throughput, and dropped sample ranges. Initial targets
are <=150 ms sound-to-display at default settings and >=30 display frames/s
on agreed desktop hardware; validate feasibility before calling them guarantees.

Run at least 30 minutes with live capture and repeated freeze/resume/export.
Check memory reaches a bounded plateau and worker queues do not accumulate.
Stress the renderer to verify timeline integrity and visible gap handling.

Desktop target families: Chromium, Firefox, Safari. Mobile validation must use
actual iOS Safari and Android Chrome, including permission and backgrounding
behavior. Playwright mobile viewport emulation checks layout only.

## Release evidence

For each analysis milestone, publish fixture parameters, algorithm/version and
settings, tolerances chosen before evaluation, results including failures,
and known limitations. Evaluate accepted-frame accuracy alongside rejection
coverage: rejecting every difficult frame is not a useful tracker.

Finish with an unaided singer walkthrough: enable the mic, sustain a vowel,
slide pitch, change volume, freeze, zoom, export, and stop. Phase 2 adds
interpreting note/cents and recognizing when formant tracks are uncertain.
