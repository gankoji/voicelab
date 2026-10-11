import { describe, expect, it } from 'vitest';
import { SampleBatcher } from './sample-batcher';

describe('bounded sample batching', () => {
  it('keeps sample order and exact start positions across arbitrary callback sizes', () => {
    const blocks: { samples: Float32Array<ArrayBuffer>; first: number }[] = [];
    const batcher = new SampleBatcher((samples, first) => blocks.push({ samples, first }), 4, 2);
    batcher.push(new Float32Array([0, 1, 2]), 0);
    batcher.push(new Float32Array([3, 4, 5, 6, 7]), 3);
    expect(blocks.map(({ samples, first }) => [Array.from(samples), first])).toEqual([
      [[0, 1, 2, 3], 0], [[4, 5, 6, 7], 4],
    ]);
  });

  it('drops input with no free buffer and resumes with a timestamped gap', () => {
    const blocks: { samples: Float32Array<ArrayBuffer>; first: number }[] = [];
    const batcher = new SampleBatcher((samples, first) => blocks.push({ samples, first }), 4, 1);
    batcher.push(new Float32Array([0, 1, 2, 3]), 0);
    const original = blocks[0]!.samples;
    for (let index = 4; index < 4004; index += 4) {
      batcher.push(new Float32Array(4), index);
    }
    expect(blocks).toHaveLength(1);
    batcher.recycle(original);
    batcher.push(new Float32Array([4, 5, 6, 7]), 4004);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.first).toBe(4004);
    expect(blocks[1]!.samples).toBe(original);
    expect(Array.from(original)).toEqual([4, 5, 6, 7]);
  });

  it('never joins a partial block across an input discontinuity', () => {
    const blocks: { samples: number[]; first: number }[] = [];
    const batcher = new SampleBatcher((samples, first) => blocks.push({ samples: Array.from(samples), first }), 4, 1);
    batcher.push(new Float32Array([1, 2]), 0);
    batcher.push(new Float32Array([3, 4, 5, 6]), 10);
    expect(blocks).toEqual([{ samples: [3, 4, 5, 6], first: 10 }]);
  });
});
