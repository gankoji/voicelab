const BUCKET_SIZE = 128;

export interface RangeSummary {
  minimum: number;
  maximum: number;
  sumSquares: number;
  count: number;
}

/** Fixed-size raw history plus exact 128-sample summaries for overview queries. */
export class AudioHistory {
  readonly capacity: number;
  private samples: Float32Array;
  private tags: Float64Array;
  private minimum: Float32Array;
  private maximum: Float32Array;
  private squares: Float64Array;
  private counts: Uint16Array;
  endSample = 0;

  constructor(capacity: number) {
    this.capacity = Math.ceil(capacity / BUCKET_SIZE) * BUCKET_SIZE;
    this.samples = new Float32Array(this.capacity).fill(NaN);
    const buckets = this.capacity / BUCKET_SIZE;
    this.tags = new Float64Array(buckets).fill(-1);
    this.minimum = new Float32Array(buckets);
    this.maximum = new Float32Array(buckets);
    this.squares = new Float64Array(buckets);
    this.counts = new Uint16Array(buckets);
  }

  get byteLength() {
    return this.samples.byteLength + this.tags.byteLength + this.minimum.byteLength
      + this.maximum.byteLength + this.squares.byteLength + this.counts.byteLength;
  }

  append(input: Float32Array, firstSample: number) {
    if (firstSample < this.endSample) throw new Error('Audio history requires increasing sample positions.');
    // At most one ring's worth of work, even after a very long interruption.
    for (let n = Math.max(this.endSample, firstSample - this.capacity); n < firstSample; n++) {
      this.samples[n % this.capacity] = NaN;
    }
    for (let offset = Math.max(0, input.length - this.capacity); offset < input.length; offset++) {
      const n = firstSample + offset;
      const value = input[offset]!;
      this.samples[n % this.capacity] = value;
      const tag = Math.floor(n / BUCKET_SIZE);
      const bucket = tag % this.tags.length;
      if (this.tags[bucket] !== tag) {
        this.tags[bucket] = tag;
        this.minimum[bucket] = Infinity;
        this.maximum[bucket] = -Infinity;
        this.squares[bucket] = 0;
        this.counts[bucket] = 0;
      }
      this.minimum[bucket] = Math.min(this.minimum[bucket]!, value);
      this.maximum[bucket] = Math.max(this.maximum[bucket]!, value);
      this.squares[bucket]! += value * value;
      this.counts[bucket]!++;
    }
    this.endSample = firstSample + input.length;
  }

  sampleAt(n: number): number {
    if (n < Math.max(0, this.endSample - this.capacity) || n >= this.endSample) return NaN;
    return this.samples[n % this.capacity]!;
  }

  summarize(start: number, end: number): RangeSummary | null {
    if (start < Math.max(0, this.endSample - this.capacity) || end > this.endSample || end <= start) return null;
    let minimum = Infinity;
    let maximum = -Infinity;
    let sumSquares = 0;
    let n = start;
    while (n < end) {
      if (n % BUCKET_SIZE === 0 && end - n >= BUCKET_SIZE) {
        const tag = n / BUCKET_SIZE;
        const bucket = tag % this.tags.length;
        if (this.tags[bucket] !== tag || this.counts[bucket] !== BUCKET_SIZE) return null;
        minimum = Math.min(minimum, this.minimum[bucket]!);
        maximum = Math.max(maximum, this.maximum[bucket]!);
        sumSquares += this.squares[bucket]!;
        n += BUCKET_SIZE;
      } else {
        const value = this.samples[n % this.capacity]!;
        if (!Number.isFinite(value)) return null;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        sumSquares += value * value;
        n++;
      }
    }
    return { minimum, maximum, sumSquares, count: end - start };
  }
}
