# Requirements

Status: capture, local file import, live/frozen visualization, zoom/inspect,
export, preferences, F0/12TET pitch and preliminary F1–F3 formants are implemented.
See [capture validation](capture-validation.md),
[visualization validation](visualization-validation.md), and
[release hardening](release-hardening.md) for evidence and limits.
Requirement IDs are stable references for issues, code reviews, and tests.
“Phase 2” means required for the application, not an optional enhancement.

## Audience and purpose

Singers exploring their own voices should be able to sing into a microphone,
see time-aligned spectral content and waveform detail, and freeze an interesting
moment for inspection and export. No account or audio engineering expertise
should be necessary.

Desktop browsers are the first target. Phone and tablet browsers are a design
goal and require explicit real-device validation before being called supported.
The app is educational, not diagnostic.

## Phase 1: capture and visualization

| ID | Requirement | Acceptance |
| --- | --- | --- |
| CAP-01 | Explicit microphone start/stop and persistent capture status. Never start on page load. | Start requests permission; stop ends tracks and releases capture resources; reload never resumes capture automatically. |
| CAP-02 | Choose among available inputs, with useful permission, disconnection, and interruption handling. | Supported device changes work; unavailable inputs produce a recoverable state rather than stale “live” plots. Labels may appear only after permission. |
| CAP-03 | Request disabled automatic gain control, noise suppression, and echo cancellation where supported. Report actual sample rate and reported processing state. | Unsupported or unknown settings are disclosed; the UI never promises bit-perfect/raw hardware capture. |
| CAP-04 | Show input level and a digital clipping/near-full-scale warning. | Known test signals produce documented peak/RMS levels and warning behavior. Digital checks are not a guarantee against analog clipping. |
| CAP-05 | Stop capture when the page is hidden or left; require explicit restart. | Tab switching, pagehide, and capture interruptions never lead to silent automatic background recording. |
| VIS-01 | Scrolling STFT spectrogram: shared time axis, frequency axis, color level legend. | Tones, harmonics, sweeps, and transients appear at expected coordinates under the validation plan. |
| VIS-02 | Detailed waveform: min/max per display column when zoomed out, individual samples when zoomed in. | Brief peaks are preserved; samples are inspectable at high zoom; it stays aligned with the spectrogram. |
| VIS-03 | Optional RMS amplitude line. | Uses the same time base and explicitly labeled units; a logarithmic RMS line cannot silently share the linear waveform scale. |
| VIS-04 | Frequency range, linear/log frequency scale, history duration, intensity floor/range, and analysis presets. | Settings have understandable labels and bounds; frequency never exceeds Nyquist; settings affecting analysis are recorded. |
| VIS-05 | Fixed, documented spectral normalization and default intensity scale. | Display brightness does not modify audio; auto-scaling, if added, is opt-in and labeled. Distinguish spectral reference from waveform dBFS. |
| INS-01 | Freeze/resume both views, zoom/pan retained history, inspect time/frequency/level. | A frozen snapshot remains stable while the live ring buffer advances. Resume returns to live and represents any capture discontinuity honestly. |
| INS-02 | Distinguish frozen display from stopped microphone. | Capture status remains visible while frozen; stop is always available. |
| BUF-01 | Bounded recent-audio retention in memory. | Proposed default is 30 seconds; no unbounded accumulation. Frozen snapshots also have a fixed maximum size. |
| EXP-01 | Explicit WAV export of a clearly identified retained interval. | Export corresponds to the chosen snapshot/interval and its actual sample rate, not to silently overwritten ring-buffer data. |
| EXP-02 | Export the visible plots as an image and analysis/display settings as metadata or companion JSON. | Exports identify time range, units, settings, app version, sample rate, and known capture processing. No system save without user action. |
| SET-01 | Persist display preferences locally, not microphone consent or audio. | Reload restores valid preferences but no audio or active capture. Corrupt/obsolete preferences fall back safely. |

### Initial defaults to validate

- 10 seconds visible; 30 seconds retained.
- Frequency range around 50 Hz–10 kHz, bounded by sample rate.
- Hann STFT window; timing/detail presets with documented FFT size and hop.
- Fixed default intensity scale with perceptually ordered, accessible colors.
- Linear waveform amplitude; input peak/RMS meter in dBFS.

Implemented defaults and their test evidence are documented in the
[visualization validation](visualization-validation.md) record. This requirements
document alone is not an accuracy or compatibility guarantee.

## Phase 2: required tracking

| ID | Requirement | Acceptance |
| --- | --- | --- |
| PIT-01 | Monophonic F0 in Hz, confidence/periodicity, voiced/unvoiced state, timestamp, and spectrogram overlay. | Validated singing-relevant pitch range and error thresholds are published; unreliable/unvoiced frames do not display fabricated pitch. |
| PIT-02 | Nearest 12TET note, octave, cents deviation, and adjustable reference A4, default 440 Hz. | A4 maps to its configured frequency; octave convention is documented (MIDI 60 = C4); boundaries and alternate tuning are tested. |
| PIT-03 | Preserve meaningful vibrato and disclose smoothing/latency. | No unexplained octave jumps or smoothing that hides tested vibrato; gaps and low-confidence intervals are visible. |
| FOR-01 | Time-aligned F1–F3 estimates and spectrogram tracks. | Tests cover known synthetic resonances and licensed reference speech/singing; supported conditions and observed errors are documented. |
| FOR-02 | Expose uncertainty and reject implausible/unsupported estimates. | High-F0, sparse harmonics, breathiness, and noisy/unvoiced input may yield gaps rather than confident false tracks. No claim that formants equal bright harmonics. |
| FOR-03 | Provide fine-grained analysis for formants: longer analysis windows / finer FFT frequency resolution than the live spectrogram presets, accepting extra latency or compute time. | A formant pass can select a finer FFT (e.g. N=8192/16384) or an equivalently longer window; the chosen window/hop, bin spacing, and latency cost are recorded, and the frozen/exported path can use it without slowing the live spectrogram loop. |
| ANA-01 | Export timestamped tracking results with units, validity/confidence fields, and reproducible analysis settings. | Missing values are distinct from zero; export can be aligned back to audio sample positions. |

## Cross-cutting requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| PRIV-01 | Local audio processing, no accounts, uploads, analytics, or telemetry by default. | Network inspection verifies no audio-bearing requests; app assets may be downloaded normally. Session audio is discarded when closed. |
| PERF-01 | Provisional default target: sound-to-display latency <=150 ms and >=30 display frames/s on agreed desktop reference hardware. | Hardware, browser, sample rate, settings, and measurement method are recorded. Long analysis windows can increase latency and must disclose that tradeoff. |
| PERF-02 | 30-minute session with bounded memory and queues; sample-derived timing independent of rendering. | Stress/soak tests show no growing backlog; dropped input produces visible gaps. Panel alignment is within one analysis hop. |
| ACC-01 | Keyboard controls, visible focus, scalable labels, readable legends, color options, numeric readouts. | Keyboard walkthrough and contrast checks; meaningful information is not communicated through color alone. |
| WEB-01 | Desktop Chromium, Firefox, and Safari are initial target families. | Publish tested versions; do not confuse planned targets with verified support. Mobile includes actual iOS Safari and Android Chrome tests. |
| WEB-02 | Responsive touch-friendly layout; no essential hover-only interactions. | Narrow portrait and tablet landscape views remain usable; touch inspection has an alternative to desktop hover. |
| OFF-01 | Offline loading after an initial successful online load, in a later Phase 1 milestone. | Installed/cached app reloads offline; updates do not interrupt or silently discard an active session. |
| OSS-01 | MIT license, reproducible setup, dependency/asset license review, original branding. | Fresh clone passes documented checks; reusable fixtures contain no unlicensed personal recordings. |
| SAFE-01 | No medical, technique-classification, or uncalibrated SPL claims. | UI and documentation label digital levels and estimated resonances honestly. |

## Not in current scope

Playback, take comparison, vocal-technique scoring, clinical
interpretation, calibrated SPL, system-audio capture, stereo/multichannel
analysis, native apps, cloud storage, and collaboration. Adding any of these
requires a separate scope decision.
