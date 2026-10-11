import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipelineInit, SampleBlock } from './protocol';

describe('capture processor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('outputs only silence, anchors time to the first input, and preserves subsequent gaps', async () => {
    interface TestProcessor {
      port: { onmessage: (event: { data: PipelineInit }) => void };
      process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
    }
    let Processor!: new () => TestProcessor;
    vi.stubGlobal('AudioWorkletProcessor', class {
      port = { onmessage: null };
    });
    vi.stubGlobal('registerProcessor', (name: string, registered: new () => TestProcessor) => {
      expect(name).toBe('voice-lab-capture');
      Processor = registered;
    });
    vi.stubGlobal('currentFrame', 0);
    await import('./capture.worklet');
    const processor = new Processor();
    const postMessage = vi.fn();
    const port = { postMessage, onmessage: null };
    processor.port.onmessage({ data: {
      type: 'init', sessionId: 7, sampleRate: 48000, port: port as unknown as MessagePort,
    } });
    const output = new Float32Array(2048).fill(1);
    processor.process([[]], [[output]]);
    expect(output.every((sample) => sample === 0)).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();

    vi.stubGlobal('currentFrame', 4096);
    processor.process([[new Float32Array(2048).fill(0.5)]], [[output.fill(1)]]);
    const first = postMessage.mock.calls[0]![0] as SampleBlock;
    expect(first.firstSample).toBe(0);
    expect(first.samples.every((sample) => sample === 0.5)).toBe(true);
    expect(output.every((sample) => sample === 0)).toBe(true);

    vi.stubGlobal('currentFrame', 8192);
    processor.process([[new Float32Array(2048)]], [[output]]);
    const next = postMessage.mock.calls[1]![0] as SampleBlock;
    expect(next.firstSample).toBe(4096); // 2048 samples missing after the first block.
  });
});
