# Architecture

Status: capture and peak/RMS measurement implemented; spectral analysis, retained
history, visualization, snapshots, and tracking below remain implementation
design. See [capture validation](capture-validation.md) for the current boundary.

## Decisions

| Choice | Recommendation and tradeoff |
| --- | --- |
| Delivery | Browser-first: easy access and sharing. Less control over hardware, processing, and interruptions than native desktop. Revisit native only if capture requirements demand it. |
| UI | React + TypeScript + Vite. React owns controls/layout; never use component state as an audio sample transport. |
| Capture | `getUserMedia` → Web Audio → AudioWorklet. Request mono and disabled processing; inspect what the browser actually reports. |
| Analysis | Dedicated Web Worker, separate from rendering. AudioWorklet only batches samples; no FFT, allocation-heavy tracking, or UI work in the real-time callback. |
| Transport | Bounded transferable-buffer batches first. SharedArrayBuffer would reduce copying but requires cross-origin isolation; introduce only if measurement justifies deployment complexity. |
| Drawing | Canvas 2D, incrementally updated spectrogram and multiresolution waveform. WebGL adds complexity; use it only if profiling shows Canvas is insufficient. |
| Dependencies | Select an FFT implementation during the DSP milestone after license, normalization, correctness, and performance review. Evaluate trackers rather than committing to a library now. |
| Deployment | Static hosting over HTTPS, no backend. Localhost is suitable for desktop development; HTTP over a LAN is not a secure microphone context. |

## Proposed module boundaries

```text
src/
  audio/          capture lifecycle, device selection, worklet, transport
  analysis/       worker entry point, STFT, RMS, future pitch/formant estimators
  buffers/        sample-indexed ring buffer, snapshots, waveform summaries
  visualization/  canvases, coordinate transforms, axes, inspection
  export/         WAV, image, settings and tracking data
  ui/             React controls and application state
```

Create these modules as working features need them; avoid empty abstractions
or splitting one application into packages prematurely.

## Pipeline and clock

1. User explicitly starts capture; establish a new session identifier and sample
   rate. Request a selected input and disable browser processing where possible.
2. AudioWorklet collects contiguous samples into reusable batches, tagged with
   session ID and the first sample's index. A direct MessagePort to the analysis
   worker is preferred; any main-thread relay should forward, not process.
3. The worker keeps bounded recent samples and produces STFT/RMS results.
   Later F0 and formant estimators consume the same timeline but can use
   different windows, hops, and preprocessing.
4. Analysis results identify their window's center sample and extent. The
   renderer maps all views using the same time-to-pixel transform.
5. Rendering runs at animation-frame cadence and can skip obsolete display
   updates without pretending missing audio was captured.

Use sample positions, not `Date.now()` or animation timestamps, as the audio
clock. A sample at index `n` has relative time `n / sampleRate`. Window-center
timestamps expose intrinsic analysis latency; they do not eliminate it.
New sessions/device changes cannot silently reuse a previous sample rate.

Do not connect captured microphone samples to speakers. Use a silent processing
path if the browser requires an active destination to keep a worklet running.
Verify that behavior in every supported browser.

## Bounded resources and ownership

The capture milestone uses four 2048-sample Float32 buffers (32 KiB total) on
a direct worklet/worker MessagePort. Block duration is about 42.7 ms at 48 kHz
or 46.4 ms at 44.1 kHz; it is not an end-to-end latency guarantee. The clock
origin is the first input processed, not node construction. Missing sample
intervals after that origin are reported, including discarded partial blocks.

The UI pulls peak/RMS summaries every 100 ms, with at most one unanswered
request. Each RMS is sample-weighted across the blocks since the previous read;
levels are not averaged in dB. Silence is -Infinity dBFS, rendered as −∞;
the meter visually floors at -60 dBFS. A sample magnitude >= `10^(-0.1/20)`
triggers a near-clipping warning held for one second of the audio timeline.
This is not a true-peak meter or a detector of upstream analog clipping.

The controller rejects stale sessions, closes late-arriving permission streams,
and tears down capture on track mute/end, context suspension, processor/worker
failure, or a three-second sample stall. Worker initialization has a five-second
deadline. Keeping the page visible is required: pagehide/hidden stops capture,
with explicit restart rather than background recording.

Use a fixed pool of sample buffers and a bounded number of in-flight batches.
Transfer ownership explicitly, recycle completed buffers, and reject stale
session messages. If the consumer cannot keep up, record the missing sample
range and mark a discontinuity; do not let MessagePort queues grow forever.

A default 30-second mono Float32 buffer at 48 kHz is about 5.76 MB. Spectrogram
columns, waveform summaries, frozen copies, and export buffers require their
own explicit bounds. Store only needed history, not every result since startup.

Waveforms use min/max summaries at overview scales, not point subsampling.
At fine zoom, draw actual samples. Frozen high-detail spectrogram inspection
may require reanalysis of the retained samples; the export records the settings
actually used for that view.

## Capture state and view state are independent

- Capture: idle → requesting → running → stopped, or an error/interruption.
- View: live or a frozen immutable snapshot, with a selected time range.

Freezing copies a bounded, coherent snapshot (audio, analysis, settings, sample
range) that cannot be overwritten by continued capture. Keep microphone status
visible. Stopping capture releases tracks/nodes and leaves the snapshot
available until explicitly discarded or the page is closed.

Handle stop while permission is pending: late successful streams must be
immediately stopped if the request is no longer current. Track-ended, suspended
AudioContext, device switch, page lifecycle, and unmount paths must not leak
capture resources. Resume after interruption should require an explicit action
when browser policy requires it, with missing time marked.

## Analysis semantics

### Spectrogram and level

For the upcoming spectrogram, use a documented STFT window, FFT normalization, hop size, and spectral
magnitude/power reference. Distinguish spectral bin level from time-domain
peak/RMS dBFS. Floors are display decisions, not nonzero measured silence.
Changing intensity or color does not change audio.

Window duration and bin spacing depend on actual sample rate: `N / fs` seconds
and `fs / N` Hz. Zero-padding can interpolate the displayed spectrum but does
not improve true frequency resolution. Presets explain timing/detail tradeoffs.

### F0 and 12TET

Evaluate YIN and McLeod pitch detection against the validation fixtures.
Strongest-bin selection is not adequate: the fundamental may be weak or absent.
Return F0 or no estimate, periodicity/confidence, voiced state, and timestamp.
Do not describe an algorithm score as a calibrated probability without evidence.

For a valid positive F0 and reference A4:

```text
midi = 69 + 12 * log2(f0 / referenceA4)
nearest = round(midi)
cents = 100 * (midi - nearest)
```

Document rounding at exact half-semitone boundaries, note naming, and the
octave convention (MIDI 60 = C4). Keep raw estimates separate from display
smoothing; avoid removing vibrato or connecting tracks across unvoiced gaps.

### Formants

Evaluate an LPC-based pipeline: appropriate resampling/pre-emphasis/windowing,
LPC estimation, root-to-frequency/bandwidth conversion, plausibility checks,
and temporal association. Model order and preprocessing are sample-rate
dependent and must be recorded.

High F0 produces sparse harmonics and can make formants indeterminate.
Breathiness, noise, and source/tract interactions also matter. F1–F3 are
estimated resonances, not the first three harmonic peaks. Confidence flags,
rejection, and visible gaps are essential; do not ship attractive but
unvalidated curves.

## Export and privacy

WAV export and plot export use the selected stable interval, not a moving buffer.
Include a versioned companion JSON format with sample rate, interval, analysis
and display settings, capture-processing reports, and application version.
Phase 2 adds timestamped estimates with explicit missing/invalid values.
Specify WAV encoding and clipping policy during export implementation.

Audio stays in volatile memory unless the user exports it. Store only validated
preferences locally, not audio. No external fonts, analytics, or third-party
runtime services are needed. Offline caching covers application assets only.
Serve production files from `dist/`; never serve the repository as a public
static directory.

## Open decisions and release gates

- FFT dependency, normalization, window/hop presets, and display floor.
- Reference devices and supported browser versions, measured end-to-end latency.
- Pitch range, acceptable errors, confidence thresholds, and smoothing.
- Formant estimator validity ranges and rejection rules.
- WAV encoding, analysis export schema, and offline update strategy.

Resolve each with a small benchmark or validation task before building dependent
UI. See [analysis validation](analysis-validation.md) and [roadmap](roadmap.md).
