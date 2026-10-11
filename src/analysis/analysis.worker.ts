import type {
  MeterRequest, PipelineInit, RecycledBlock, SampleBlock, SnapshotRequest, ViewRequest, WorkerReply,
} from '../audio/protocol';
import { LevelAccumulator } from './levels';
import { LiveAnalysis } from './live-analysis';

// A narrow worker scope avoids mixing the DOM and WebWorker global libraries.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PipelineInit | MeterRequest | ViewRequest | SnapshotRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
};

let sessionId: number | undefined;
let levels: LevelAccumulator | undefined;
let analysis: LiveAnalysis | undefined;

scope.onmessage = ({ data }) => {
  if (data.type === 'init' && !levels) {
    sessionId = data.sessionId;
    levels = new LevelAccumulator(data.sampleRate);
    analysis = new LiveAnalysis(data.sampleRate);
    const port = data.port;
    port.onmessage = ({ data: block }: MessageEvent<SampleBlock>) => {
      if (block.type !== 'samples' || block.sessionId !== sessionId) return;
      levels!.add(block.samples, block.firstSample);
      analysis!.append(block.samples, block.firstSample);
      const returned: RecycledBlock = {
        type: 'recycle', sessionId, samples: block.samples,
      };
      port.postMessage(returned, [block.samples.buffer]);
    };
    scope.postMessage({ type: 'ready', sessionId });
  } else if (data.type === 'read-meter' && data.sessionId === sessionId && levels) {
    // Pull-based summaries keep the worker → UI queue bounded too.
    scope.postMessage({ type: 'meter', sessionId, reading: levels.read() });
  } else if (data.type === 'read-view' && data.sessionId === sessionId && analysis) {
    const frame = analysis.render(data.settings, data.width);
    scope.postMessage({ type: 'view', sessionId, frame }, [
      frame.spectrum.buffer, frame.minimum.buffer, frame.maximum.buffer, frame.rms.buffer, frame.trace.buffer,
    ]);
  } else if (data.type === 'snapshot' && data.sessionId === sessionId && analysis) {
    const samples = analysis.audio.retainedSamples();
    scope.postMessage({
      type: 'snapshot', sessionId, samples, sampleRate: analysis.sampleRate, endSample: analysis.audio.endSample,
    }, [samples.buffer]);
  }
};
