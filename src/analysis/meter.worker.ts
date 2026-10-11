import type {
  MeterRequest, PipelineInit, RecycledBlock, SampleBlock, WorkerReply,
} from '../audio/protocol';
import { LevelAccumulator } from './levels';

// A narrow worker scope avoids mixing the DOM and WebWorker global libraries.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PipelineInit | MeterRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
};

let sessionId: number | undefined;
let levels: LevelAccumulator | undefined;

scope.onmessage = ({ data }) => {
  if (data.type === 'init' && !levels) {
    sessionId = data.sessionId;
    levels = new LevelAccumulator(data.sampleRate);
    const port = data.port;
    port.onmessage = ({ data: block }: MessageEvent<SampleBlock>) => {
      if (block.type !== 'samples' || block.sessionId !== sessionId) return;
      levels!.add(block.samples, block.firstSample);
      const returned: RecycledBlock = {
        type: 'recycle', sessionId, samples: block.samples,
      };
      port.postMessage(returned, [block.samples.buffer]);
    };
    scope.postMessage({ type: 'ready', sessionId });
  } else if (data.type === 'read-meter' && data.sessionId === sessionId && levels) {
    // Pull-based summaries keep the worker → UI queue bounded too.
    scope.postMessage({ type: 'meter', sessionId, reading: levels.read() });
  }
};
