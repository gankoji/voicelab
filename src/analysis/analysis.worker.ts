import type {
  MeterRequest, PipelineInit, RecycledBlock, SampleBlock, SnapshotRequest, ViewRequest, WorkerReply,
} from '../audio/protocol';
import { LevelAccumulator } from './levels';
import { LiveAnalysis } from './live-analysis';
import { PitchHistory } from './pitch-history';
import { PitchTracker } from './pitch-tracker';
import { FormantHistory, FormantTracker } from './formant-tracker';

// A narrow worker scope avoids mixing the DOM and WebWorker global libraries.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PipelineInit | MeterRequest | ViewRequest | SnapshotRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
};

let sessionId: number | undefined;
let levels: LevelAccumulator | undefined;
let analysis: LiveAnalysis | undefined;
let pitchHistory: PitchHistory | undefined;
let pitchTracker: PitchTracker | undefined;
let formantHistory: FormantHistory | undefined;
let formantTracker: FormantTracker | undefined;
let lastPitchVoiced = false;

scope.onmessage = ({ data }) => {
  if (data.type === 'init' && !levels) {
    sessionId = data.sessionId;
    levels = new LevelAccumulator(data.sampleRate);
    analysis = new LiveAnalysis(data.sampleRate);
    const pitchHop = 512;
    pitchHistory = new PitchHistory(Math.ceil(30 * data.sampleRate / pitchHop) + 2);
    pitchTracker = new PitchTracker((point) => {
      lastPitchVoiced = point.voiced;
      pitchHistory!.push(point);
    }, { sampleRate: data.sampleRate, windowSize: 2048, hop: pitchHop });
    const formantHop = 1024;
    formantHistory = new FormantHistory(Math.ceil(30 * data.sampleRate / formantHop) + 2);
    formantTracker = new FormantTracker((point) => formantHistory!.push(point), () => lastPitchVoiced, {
      sampleRate: data.sampleRate, windowSize: 2400, hop: formantHop, order: 12,
    });
    const port = data.port;
    port.onmessage = ({ data: block }: MessageEvent<SampleBlock>) => {
      if (block.type !== 'samples' || block.sessionId !== sessionId) return;
      levels!.add(block.samples, block.firstSample);
      analysis!.append(block.samples, block.firstSample);
      pitchTracker!.ingest(block.samples, block.firstSample);
      formantTracker!.ingest(block.samples, block.firstSample);
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
    const pitch = pitchHistory?.range(frame.startSample, frame.endSample) ?? [];
    const formants = formantHistory?.range(frame.startSample, frame.endSample) ?? [];
    scope.postMessage({ type: 'view', sessionId, frame, pitch, formants }, [
      frame.spectrum.buffer, frame.minimum.buffer, frame.maximum.buffer, frame.rms.buffer, frame.trace.buffer,
    ]);
  } else if (data.type === 'snapshot' && data.sessionId === sessionId && analysis) {
    const samples = analysis.audio.retainedSamples();
    const offset = Math.max(0, analysis.audio.endSample - analysis.audio.capacity);
    const pitch = (pitchHistory?.range(offset, analysis.audio.endSample) ?? [])
      .map((point) => ({ ...point, sampleIndex: point.sampleIndex - offset }));
    const formants = (formantHistory?.range(offset, analysis.audio.endSample) ?? [])
      .map((point) => ({ ...point, sampleIndex: point.sampleIndex - offset }));
    scope.postMessage({
      type: 'snapshot', sessionId, samples, sampleRate: analysis.sampleRate,
      endSample: analysis.audio.endSample, pitch, formants,
    }, [samples.buffer]);
  }
};
