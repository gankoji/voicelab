import { describe, expect, it } from 'vitest';
import { describePitch, f0ToMidi, midiToCents, midiToNoteName } from './midi';

describe('12TET conversion', () => {
  it('maps A4 and its octaves at the default reference', () => {
    expect(f0ToMidi(440)).toBeCloseTo(69, 8);
    expect(f0ToMidi(880)).toBeCloseTo(81, 8);
    expect(f0ToMidi(220)).toBeCloseTo(57, 8);
  });

  it('uses scientific pitch notation with MIDI 60 = C4', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(0)).toBe('C-1');
    expect(midiToNoteName(127)).toBe('G9');
  });

  it('reports cents relative to the nearest note', () => {
    expect(midiToCents(69)).toBe(0);
    expect(midiToCents(69.5)).toBeCloseTo(-50, 6); // half-sharp rounds up to A#4
    expect(midiToCents(69.25)).toBeCloseTo(25, 6);
  });

  it('describes a pitch as note and cents', () => {
    expect(describePitch(440)!.note).toBe('A4');
    expect(describePitch(440)!.cents).toBeCloseTo(0, 8);
    expect(describePitch(261.6256)!.note).toBe('C4');
    expect(describePitch(261.6256)!.cents).toBeCloseTo(0, 1);
    expect(describePitch(466.16)!.note).toBe('A#4');
    expect(describePitch(466.16)!.cents).toBeCloseTo(0, 0);
    expect(describePitch(445)!.note).toBe('A4');
    expect(describePitch(445)!.cents).toBeCloseTo(19.5, 0);
  });

  it('honors an alternate tuning reference', () => {
    expect(describePitch(415, 415)!.note).toBe('A4');
    expect(describePitch(415, 415)!.cents).toBeCloseTo(0, 8);
    expect(describePitch(0)).toBeNull();
  });
});
