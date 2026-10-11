import { BLOCK_SIZE, BUFFER_COUNT } from './protocol';

/**
 * Owns only a fixed pool of buffers. A slow consumer loses samples, not memory.
 * Timestamps preserve those gaps; no partial block bridges a missing interval.
 */
export class SampleBatcher {
  private available: Float32Array<ArrayBuffer>[];
  private current: Float32Array<ArrayBuffer> | undefined;
  private used = 0;
  private firstSample = 0;
  private nextSample = 0;

  constructor(
    private readonly emit: (samples: Float32Array<ArrayBuffer>, firstSample: number) => void,
    private readonly blockSize = BLOCK_SIZE,
    bufferCount = BUFFER_COUNT,
  ) {
    this.available = Array.from({ length: bufferCount }, () => new Float32Array(blockSize));
  }

  recycle(samples: Float32Array<ArrayBuffer>) {
    this.available.push(samples);
  }

  push(input: Float32Array, firstSample: number) {
    if (firstSample !== this.nextSample) {
      this.used = 0;
    }
    this.nextSample = firstSample + input.length;

    let offset = 0;
    while (offset < input.length) {
      this.current ??= this.available.pop();
      if (!this.current) return;

      if (this.used === 0) this.firstSample = firstSample + offset;
      const count = Math.min(input.length - offset, this.blockSize - this.used);
      this.current.set(input.subarray(offset, offset + count), this.used);
      offset += count;
      this.used += count;

      if (this.used === this.blockSize) {
        const completed = this.current;
        this.current = undefined;
        this.used = 0;
        this.emit(completed, this.firstSample);
      }
    }
  }
}
