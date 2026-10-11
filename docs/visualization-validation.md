# Live visualization validation

## What works

- Live scrolling spectrogram and synchronized detailed waveform.
- 5 ms–30 s visible history, linear/log frequency scale, frequency bounds,
  fixed color floor/ceiling, and timing/balanced/frequency-detail presets.
- Min/max waveform overviews without discarding brief peaks; individual samples
  when at least one horizontal display column is available per sample.
- Optional centered 20 ms RMS, on the waveform's linear amplitude axis.
- Bounded audio/spectral history and visible missing-data regions.
- A zero-amplitude reference line plus a lightly tinted not-yet-captured region
  on the waveform, so silence is distinct from the leading empty history.
- Optional automatic waveform gain (on by default): the vertical amplitude axis
  scales to the loudest sample in the visible window, capped at 100× and never
  zooming into signals below -60 dBFS. The y-axis labels show the fitted scale;
  the dBFS input meter remains the un-scaled level reference.
- Pause/Resume keeps capture running while the view stops scrolling; hovering
  the frozen plots shows a time + frequency + approximate dB readout on the
  spectrogram and a time + min/max amplitude readout on the waveform.
- Paused zoom/pan: scroll zooms around the cursor and dragging pans within the
  copied raw-audio snapshot; the view is re-analyzed from that snapshot, not the
  original rendered raster. The same snapshot remains inspectable after Stop.
- Export: a pause or stop leaves an explicit interval; Export downloads that
  interval as 16-bit PCM WAV plus a companion JSON with time alignment, sample
  rate, and the applied display/analysis settings.

Plot-image export, saved preferences, alternate palettes, pitch, and formants
remain future work.

## Signal-processing contract

The app requests a **48 kHz analysis AudioContext**; the browser may resample
the microphone track. The actual input and context rates are reported separately.
Tests also cover the DSP at 44.1 kHz; all coordinates derive from actual samples
and context rate, never animation timestamps.

| Preset | FFT size | Hop | Window at 48 kHz | Bin spacing at 48 kHz |
| --- | --- | --- | --- | --- |
| Timing | 1024 | 256 | 21.33 ms | 46.875 Hz |
| Balanced (default) | 2048 | 512 | 42.67 ms | 23.4375 Hz |
| Frequency | 4096 | 1024 | 85.33 ms | 11.71875 Hz |

Use a periodic Hann window, 75% overlap, and fft.js 4.0.4 (MIT). A bin-centered
full-scale sine has 0 dBFS spectral peak amplitude. DC and Nyquist are not
doubled. This is not power spectral density, calibrated SPL, or a pitch estimate.
Off-bin tones spread across bins and have window-dependent peak attenuation.
Bin spacing is not a promise that arbitrary nearby tones are resolvable.

The fixed default display range is -90 to 0 dBFS. Max-reduction combines
multiple bins/frames in a display pixel, preserving strong narrow/brief events.
This is a display reduction, not summed spectral power. Missing data uses a
separate background color from measured silence at the color floor.

STFT timestamps identify window centers; each displayed column spans one hop.
Both plots end half an FFT window behind captured audio. This explicit common
delay prevents the waveform from appearing ahead of the spectrogram. At gaps,
STFT restarts its window and RMS/overview summaries do not bridge missing input.
Changing the FFT preset discards spectral history rather than mixing analyses;
raw history remains available to the live waveform.

## Automated accuracy and workflow checks

`npm run check` covers:

- Bin-centered tones for all FFT presets, normalization within 0.001 dB where
  asserted, correct DC/Nyquist treatment, and true silence.
- Off-bin 440 Hz placement within one FFT bin at 44.1 and 48 kHz.
- Known harmonic ratios and the -6.0206 dB change from halving input amplitude.
- A chirp across arbitrary input batches, within two bins of instantaneous
  center frequency, with exact hop timestamps.
- Impulse energy strongest within half a hop of its known waveform location.
- Exact min/max and sum-of-squares summaries, short peaks, ring wrap,
  partial/long gaps, spectral eviction, preset reset, and sample-detail traces.
- Shared view endpoints, centered RMS, scale mappings/Nyquist limits, bounded
  request flow, and rejection of stale-session frames.

Both `npm run test:e2e` and `npm run test:e2e:dev` exercise Chromium's synthetic
microphone through the real worklet and worker. Canvas-pixel checks place the
known 440 Hz tone within 50 Hz on a 50–2000 Hz display, verify an RMS overlay,
and verify identical time endpoints. Tests change frequency scale/FFT preset,
zoom to individual samples, and check desktop/mobile-sized layout and stop.
The original capture/error/restart checks remain in those suites.

These are Chromium automation tests, not a claim of Safari/Firefox support or
actual mobile microphone validation.

## Bounded storage and performance evidence

`npm run benchmark:analysis` processes 30 minutes of synthetic audio in
accelerated time, then rasterizes the retained 30-second view at 1024 × 192
with RMS. It verifies that raw + summary + spectral history remains
**17,638,040 bytes** at the default preset, independent of session length.
The FFT uses fixed scratch arrays; view transfers are bounded to one outstanding
request and a fixed maximum viewport size.

An initial macOS arm64/Node 26 run processed the simulated 30 minutes in about
9.5 seconds; full-history worker-side raster generation was approximately
6 ms median / 8 ms p95. These are observations, not performance guarantees.
They exclude device latency, real-time scheduling, drawing, and a whole-browser
GC/memory plateau. A real 30-minute browser soak and end-to-end latency/display
cadence measurements are still release-hardening work.

## Manual check

After syncing the milestone, run `npm ci` (new FFT dependency), then
`npm run dev` from the primary checkout.

1. Press **Record**. A sustained vowel should show horizontal harmonic bands.
2. Slide pitch; those bands should move together. Change vowel; relative band
   brightness should change. These are not yet automatic F0/formant tracks.
3. Change volume moderately; the waveform and fixed spectral colors should
   reflect it. Check the numerical input levels as a separate reference.
4. Open **Settings**, then the Display controls. Try logarithmic frequency, a
   5 kHz upper limit, the frequency-detail preset, and the optional RMS overlay.
5. Switch to 20 ms/5 ms visible history to see waveform cycles. Both panels
   keep the same displayed time interval.
6. Press **Pause** while singing. Confirm the plots stop scrolling, capture
   remains live, and hovering each plot shows a numeric readout. Scroll to zoom
   around the cursor and drag to pan within the retained history; both plots
   stay aligned. Press **Resume** to return to the scrolling view. Stop also
   leaves this snapshot available for inspection.
7. Press **Stop**. Verify capture releases, plots stop, and the last view stays
   visible. Record again; previous history must clear rather than joining
   unrelated sessions.
8. Resize the window and check labels/controls and the shared horizontal axes.

Report unexpected behavior with browser/OS, input device, selected settings,
and whether the dropped-sample counter increases. No recording is needed.
