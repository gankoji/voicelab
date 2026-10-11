import type { PitchPoint } from './pitch';

/** Bounded ring of pitch points, addressable by sample index for a time range. */
export class PitchHistory {
  private points: PitchPoint[];
  private next = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.points = new Array<PitchPoint>(capacity);
  }

  push(point: PitchPoint) {
    this.points[this.next] = point;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  /** Points whose sample index is in [start, end), oldest first. */
  range(start: number, end: number): PitchPoint[] {
    if (this.count === 0) return [];
    const out: PitchPoint[] = [];
    for (let i = 0; i < this.count; i++) {
      const index = (this.next - this.count + i + this.capacity) % this.capacity;
      const point = this.points[index]!;
      if (point.sampleIndex >= start && point.sampleIndex < end) out.push(point);
    }
    return out;
  }
}
