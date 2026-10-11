export const A4_MIDI = 69;
export const A4_DEFAULT_HZ = 440;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function f0ToMidi(f0Hz: number, a4Hz: number = A4_DEFAULT_HZ): number {
  if (!(f0Hz > 0) || !(a4Hz > 0)) return NaN;
  return A4_MIDI + 12 * Math.log2(f0Hz / a4Hz);
}

/** Octave convention: MIDI 60 = C4 (scientific pitch notation). */
export function midiToNoteName(midi: number): string {
  const nearest = Math.round(midi);
  const octave = Math.floor(nearest / 12) - 1;
  const pitchClass = ((nearest % 12) + 12) % 12;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

export function midiToCents(midi: number): number {
  return (midi - Math.round(midi)) * 100;
}

export interface PitchReading {
  f0Hz: number;
  midi: number;
  nearestMidi: number;
  note: string;
  cents: number;
}

export function describePitch(f0Hz: number, a4Hz: number = A4_DEFAULT_HZ): PitchReading | null {
  const midi = f0ToMidi(f0Hz, a4Hz);
  if (!Number.isFinite(midi)) return null;
  const nearestMidi = Math.round(midi);
  return {
    f0Hz,
    midi,
    nearestMidi,
    note: midiToNoteName(midi),
    cents: midiToCents(midi),
  };
}
