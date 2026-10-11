import workletUrl from './capture.worklet?worker&url';
import { METER_INTERVAL_MS } from './protocol';
import type { MeterReading, MeterRequest, PipelineInit, WorkerReply } from './protocol';

export type CaptureStatus = 'idle' | 'requesting' | 'running' | 'stopped' | 'error';

export interface CaptureDetails {
  deviceLabel: string;
  sampleRate: number;
  trackSettings: MediaTrackSettings;
}

export interface CaptureState {
  status: CaptureStatus;
  message: string;
  details: CaptureDetails | null;
  reading: MeterReading | null;
}

/** Injectable browser boundary: the same lifecycle runs in unit tests and the UI. */
export interface CaptureEnvironment {
  unsupportedReason(): string | null;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createContext(): AudioContext;
  createWorklet(context: AudioContext): AudioWorkletNode;
  createWorker(): Worker;
  createChannel(): MessageChannel;
}

const browserEnvironment: CaptureEnvironment = {
  unsupportedReason: () => {
    if (!window.isSecureContext) return 'Microphone access needs HTTPS or localhost. Open this app in a secure context.';
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode || !window.Worker) {
      return 'This browser does not provide the required microphone, AudioWorklet, and worker APIs. Try a current desktop browser.';
    }
    return null;
  },
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  createWorklet: (context) => new AudioWorkletNode(context, 'voice-lab-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  }),
  createWorker: () => new Worker(new URL('../analysis/meter.worker.ts', import.meta.url), { type: 'module' }),
  createChannel: () => new MessageChannel(),
};

interface Session {
  id: number;
  context?: AudioContext;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  worker?: Worker;
  interval?: ReturnType<typeof setInterval>;
  cancelReady?: () => void;
  cleanups: (() => void)[];
  awaitingMeter: boolean;
  lastProgress: number;
}

function captureError(error: unknown): string {
  // DOMExceptions (and errors from other realms) need not inherit this realm's Error.
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone permission was denied. Allow microphone access in your browser or system settings, then try again.';
    case 'NotFoundError':
      return 'No microphone was found. Connect an input device, then try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone could not be opened. Check that it is connected and available, then try again.';
    case 'OverconstrainedError':
      return 'The selected input is unavailable. Choose Default input or another microphone, then try again.';
    case 'NotSupportedError':
      return 'This browser or device could not start audio capture. Try another input or a current desktop browser.';
    default:
      return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message : 'Audio capture failed. Stop and try again.';
  }
}

export class CaptureController {
  private state: CaptureState = {
    status: 'idle',
    message: 'Microphone inactive — no audio is being captured.',
    details: null,
    reading: null,
  };
  private listeners = new Set<() => void>();
  private session: Session | undefined;
  private nextId = 0;

  constructor(private readonly environment: CaptureEnvironment = browserEnvironment) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(state: CaptureState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private release(session: Session) {
    // Detach callbacks before stopping tracks/closing contexts can dispatch events.
    session.cleanups.forEach((cleanup) => cleanup());
    session.cancelReady?.();
    clearInterval(session.interval);
    session.stream?.getTracks().forEach((track) => track.stop());
    session.source?.disconnect();
    session.node?.disconnect();
    session.node?.port.close();
    session.worker?.terminate();
    if (session.context && session.context.state !== 'closed') {
      void session.context.close().catch(() => {});
    }
  }

  stop = (message = 'Microphone stopped — no audio is being captured.') => {
    const session = this.session;
    this.session = undefined;
    if (session) this.release(session);
    this.update({ status: 'stopped', message, details: null, reading: null });
  };

  private fail(session: Session, error: unknown) {
    if (this.session !== session) return;
    this.session = undefined;
    this.release(session);
    this.update({ status: 'error', message: captureError(error), details: null, reading: null });
  }

  async start(deviceId = ''): Promise<void> {
    this.stop();
    const session: Session = {
      id: ++this.nextId, cleanups: [], awaitingMeter: false, lastProgress: performance.now(),
    };
    this.session = session;
    this.update({
      status: 'requesting', message: 'Starting microphone — allow access if your browser asks.',
      details: null, reading: null,
    });

    try {
      const unsupported = this.environment.unsupportedReason();
      if (unsupported) throw new Error(unsupported);

      // Resume in the original user gesture, before awaiting microphone permission.
      const context = this.environment.createContext();
      session.context = context;
      const resumed = context.resume();
      void resumed.catch(() => {}); // Observed again below; prevent an early unhandled rejection.
      const stream = await this.environment.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          channelCount: { ideal: 1 },
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        },
        video: false,
      });
      if (this.session !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('The microphone disconnected before capture could start.');

      const interrupted = () => this.fail(session, new Error('The microphone was disconnected or interrupted. Check the input, then start again.'));
      track.addEventListener('ended', interrupted);
      track.addEventListener('mute', interrupted);
      session.cleanups.push(() => {
        track.removeEventListener('ended', interrupted);
        track.removeEventListener('mute', interrupted);
      });

      await Promise.all([context.audioWorklet.addModule(workletUrl), resumed]);
      if (this.session !== session) return;
      if (context.state !== 'running') throw new Error('Audio was suspended. Keep this page active and start again.');
      if (track.muted) throw new Error('The microphone is muted or interrupted. Check the input and start again.');

      const worker = this.environment.createWorker();
      session.worker = worker;
      const node = this.environment.createWorklet(context);
      session.node = node;
      const channel = this.environment.createChannel();
      const workerError = () => this.fail(session, new Error('The audio analysis worker failed. Stop and try again.'));
      const processorError = () => this.fail(session, new Error('The audio capture processor failed. Stop and try again.'));
      const stateChanged = () => {
        if (context.state !== 'running') {
          this.fail(session, new Error('Audio was suspended or interrupted. Keep this page active and start again.'));
        }
      };
      worker.addEventListener('error', workerError);
      worker.addEventListener('messageerror', workerError);
      node.addEventListener('processorerror', processorError);
      context.addEventListener('statechange', stateChanged);
      session.cleanups.push(() => {
        worker.removeEventListener('error', workerError);
        worker.removeEventListener('messageerror', workerError);
        node.removeEventListener('processorerror', processorError);
        context.removeEventListener('statechange', stateChanged);
        worker.onmessage = null;
        channel.port1.close();
        channel.port2.close();
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Audio analysis did not start. Stop and try again.')), 5000);
        session.cancelReady = () => {
          clearTimeout(timeout);
          resolve(); // The identity check below prevents a cancelled start from continuing.
        };
        worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
          if (this.session !== session || data.sessionId !== session.id) return;
          if (data.type === 'ready') {
            clearTimeout(timeout);
            session.cancelReady = undefined;
            resolve();
          } else if (data.type === 'meter') {
            session.awaitingMeter = false;
            if (data.reading && this.state.status === 'running') {
              session.lastProgress = performance.now();
              this.update({ ...this.state, reading: data.reading });
            }
          }
        };
        const workerInit: PipelineInit = {
          type: 'init', sessionId: session.id, sampleRate: context.sampleRate, port: channel.port2,
        };
        const workletInit: PipelineInit = { ...workerInit, port: channel.port1 };
        worker.postMessage(workerInit, [channel.port2]);
        node.port.postMessage(workletInit, [channel.port1]);
      });
      if (this.session !== session) return;

      const source = context.createMediaStreamSource(stream);
      session.source = source;
      source.connect(node);
      node.connect(context.destination); // The processor explicitly outputs zeros.
      session.lastProgress = performance.now();
      this.update({
        status: 'running',
        message: 'Microphone active — processing locally. No audio is saved or uploaded.',
        details: {
          deviceLabel: track.label || 'Selected microphone',
          sampleRate: context.sampleRate,
          trackSettings: track.getSettings(),
        },
        reading: null,
      });
      session.interval = setInterval(() => {
        if (performance.now() - session.lastProgress > 3000) {
          this.fail(session, new Error('No audio samples are arriving. Check the microphone and start again.'));
          return;
        }
        if (!session.awaitingMeter) {
          session.awaitingMeter = true;
          const request: MeterRequest = { type: 'read-meter', sessionId: session.id };
          worker.postMessage(request);
        }
      }, METER_INTERVAL_MS);
    } catch (error) {
      this.fail(session, error);
    }
  }
}
