import type { PipelineInit, RecycledBlock, SampleBlock } from './protocol';
import { SampleBatcher } from './sample-batcher';

// AudioWorklet globals are not included in TypeScript's DOM library.
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private batcher: SampleBatcher | undefined;
  private origin: number | undefined;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<PipelineInit>) => {
      if (data.type !== 'init' || this.batcher) return;
      const { port, sessionId } = data;
      this.batcher = new SampleBatcher((samples, firstSample) => {
        const block: SampleBlock = { type: 'samples', sessionId, firstSample, samples };
        port.postMessage(block, [samples.buffer]);
      });
      port.onmessage = ({ data: returned }: MessageEvent<RecycledBlock>) => {
        if (returned.type === 'recycle' && returned.sessionId === sessionId) {
          this.batcher?.recycle(returned.samples);
        }
      };
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    // This destination-connected node emits silence, never the microphone signal.
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    const input = inputs[0]?.[0];
    if (input && this.batcher) {
      // Nodes can run before their source is connected. That is startup, not lost audio.
      this.origin ??= currentFrame;
      this.batcher.push(input, currentFrame - this.origin);
    }
    return true;
  }
}

registerProcessor('voice-lab-capture', CaptureProcessor);
