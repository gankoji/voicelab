import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureController } from './capture-controller';
import type { CaptureEnvironment } from './capture-controller';
import type { MeterReading, PipelineInit, WorkerReply } from './protocol';
import { DEFAULT_VIEW } from '../analysis/view';
import { LiveAnalysis } from '../analysis/live-analysis';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const permission = deferred<MediaStream>();
  const track = Object.assign(new EventTarget(), {
    label: 'Test microphone',
    readyState: 'live',
    muted: false,
    stop: vi.fn(),
    getSettings: () => ({ sampleRate: 44100, autoGainControl: false }),
  });
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = Object.assign(new EventTarget(), {
    state: 'running',
    sampleRate: 48000,
    destination: {},
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createMediaStreamSource: vi.fn(() => source),
  });
  const node = Object.assign(new EventTarget(), {
    port: { postMessage: vi.fn(), close: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn(),
  });
  const worker = Object.assign(new EventTarget(), {
    onmessage: null as ((event: MessageEvent<WorkerReply>) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  });
  const channel = { port1: { close: vi.fn() }, port2: { close: vi.fn() } };
  const environment: CaptureEnvironment = {
    unsupportedReason: vi.fn(() => null),
    getUserMedia: vi.fn(() => permission.promise),
    createContext: vi.fn(() => context as unknown as AudioContext),
    createWorklet: vi.fn(() => node as unknown as AudioWorkletNode),
    createWorker: vi.fn(() => worker as unknown as Worker),
    createChannel: vi.fn(() => channel as unknown as MessageChannel),
  };
  const controller = new CaptureController(environment);
  const reply = (message: WorkerReply) =>
    worker.onmessage?.({ data: message } as MessageEvent<WorkerReply>);
  async function ready() {
    permission.resolve(stream);
    // Settle getUserMedia + addModule + resume, without advancing startup timers.
    await vi.advanceTimersByTimeAsync(0);
    const init = worker.postMessage.mock.calls[0]?.[0] as PipelineInit;
    expect(init.type).toBe('init');
    reply({ type: 'ready', sessionId: init.sessionId });
    return init.sessionId;
  }
  return { controller, permission, track, stream, source, context, node, worker, environment, ready, reply };
}

const reading: MeterReading = {
  peakDbfs: -12, rmsDbfs: -15, nearClipping: false,
  endSample: 2048, receivedSamples: 2048, droppedSamples: 0,
};

describe('capture lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not request permission until start, reports actual settings, and releases all resources', async () => {
    const h = harness();
    expect(h.environment.getUserMedia).not.toHaveBeenCalled();
    const started = h.controller.start('input-1');
    expect(h.context.resume).toHaveBeenCalledOnce();
    expect(h.environment.getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'input-1' }, channelCount: { ideal: 1 },
        autoGainControl: false, noiseSuppression: false, echoCancellation: false,
      },
      video: false,
    });
    const sessionId = await h.ready();
    await started;
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'running',
      details: { sampleRate: 48000, trackSettings: { sampleRate: 44100 } },
    });
    await vi.advanceTimersByTimeAsync(100);
    h.reply({ type: 'meter', sessionId, reading });
    expect(h.controller.getSnapshot().reading).toEqual(reading);
    h.controller.stop();
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.source.disconnect).toHaveBeenCalledOnce();
    expect(h.node.disconnect).toHaveBeenCalledOnce();
    expect(h.node.port.close).toHaveBeenCalledOnce();
    expect(h.worker.terminate).toHaveBeenCalledOnce();
    expect(h.context.close).toHaveBeenCalledOnce();
    expect(h.controller.getSnapshot()).toMatchObject({ status: 'stopped', reading: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops a late stream after cancelling a pending permission request', async () => {
    const h = harness();
    const started = h.controller.start();
    h.controller.stop();
    h.permission.resolve(h.stream);
    await started;
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.environment.createWorker).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().status).toBe('stopped');
  });

  it('ignores an old permission failure after a newer session starts', async () => {
    const h = harness();
    const oldPermission = deferred<MediaStream>();
    vi.mocked(h.environment.getUserMedia).mockReturnValueOnce(oldPermission.promise);
    const oldStart = h.controller.start();
    const nextStart = h.controller.start();
    const sessionId = await h.ready();
    await nextStart;
    oldPermission.reject(new DOMException('Denied', 'NotAllowedError'));
    await oldStart;
    h.reply({ type: 'meter', sessionId: sessionId - 1, reading });
    expect(h.controller.getSnapshot()).toMatchObject({ status: 'running', reading: null });
    h.controller.stop();
  });

  it.each([
    ['NotAllowedError', /permission was denied/],
    ['NotFoundError', /No microphone was found/],
    ['NotReadableError', /could not be opened/],
    ['OverconstrainedError', /selected input is unavailable/],
    ['NotSupportedError', /could not start audio capture/],
  ])('makes %s recoverable and closes the context', async (name, message) => {
    const h = harness();
    const started = h.controller.start();
    h.permission.reject(new DOMException('Capture failed', name));
    await started;
    expect(h.controller.getSnapshot()).toMatchObject({ status: 'error', message: expect.stringMatching(message) });
    expect(h.context.close).toHaveBeenCalledOnce();
  });

  it('rejects unsupported environments before opening audio resources', async () => {
    const h = harness();
    vi.mocked(h.environment.unsupportedReason).mockReturnValue('HTTPS required');
    await h.controller.start();
    expect(h.environment.createContext).not.toHaveBeenCalled();
    expect(h.environment.getUserMedia).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().message).toBe('HTTPS required');
  });

  it('cleans up when the worklet module fails to load', async () => {
    const h = harness();
    h.context.audioWorklet.addModule.mockRejectedValue(new Error('Module load failed'));
    const started = h.controller.start();
    h.permission.resolve(h.stream);
    await started;
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.controller.getSnapshot().status).toBe('error');
    expect(h.environment.createWorker).not.toHaveBeenCalled();
  });

  it('stops while the worklet module is loading without continuing setup later', async () => {
    const h = harness();
    const module = deferred<void>();
    h.context.audioWorklet.addModule.mockReturnValue(module.promise);
    const started = h.controller.start();
    h.permission.resolve(h.stream);
    await vi.advanceTimersByTimeAsync(0);
    h.controller.stop();
    module.resolve();
    await started;
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.environment.createWorker).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().status).toBe('stopped');
  });

  it('can cancel while waiting for the analysis worker', async () => {
    const h = harness();
    const started = h.controller.start();
    h.permission.resolve(h.stream);
    await vi.advanceTimersByTimeAsync(0);
    h.controller.stop();
    await started;
    expect(h.worker.terminate).toHaveBeenCalledOnce();
    expect(h.source.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a worker that never becomes ready', async () => {
    const h = harness();
    const started = h.controller.start();
    h.permission.resolve(h.stream);
    await vi.advanceTimersByTimeAsync(5001);
    await started;
    expect(h.controller.getSnapshot().message).toMatch(/did not start/);
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['ended', 'mute'])('releases capture on a track %s event', async (event) => {
    const h = harness();
    const started = h.controller.start();
    await h.ready();
    await started;
    h.track.dispatchEvent(new Event(event));
    expect(h.controller.getSnapshot().status).toBe('error');
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['worker', 'processor', 'context'])('releases capture on a %s failure', async (kind) => {
    const h = harness();
    const started = h.controller.start();
    await h.ready();
    await started;
    if (kind === 'worker') h.worker.dispatchEvent(new Event('error'));
    if (kind === 'processor') h.node.dispatchEvent(new Event('processorerror'));
    if (kind === 'context') {
      h.context.state = 'suspended';
      h.context.dispatchEvent(new Event('statechange'));
    }
    expect(h.controller.getSnapshot().status).toBe('error');
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows only one unacknowledged meter request and detects a stalled pipeline', async () => {
    const h = harness();
    const started = h.controller.start();
    await h.ready();
    await started;
    await vi.advanceTimersByTimeAsync(500);
    expect(h.worker.postMessage.mock.calls.filter(([message]) => message.type === 'read-meter')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2700);
    expect(h.controller.getSnapshot().message).toMatch(/No audio samples/);
    expect(h.track.stop).toHaveBeenCalledOnce();
  });

  it('bounds view requests, rejects stale frames, and keeps plot data out of state', async () => {
    const h = harness();
    const started = h.controller.start();
    const sessionId = await h.ready();
    await started;
    h.controller.requestView(DEFAULT_VIEW, 500);
    h.controller.requestView(DEFAULT_VIEW, 500);
    expect(h.worker.postMessage.mock.calls.filter(([message]) => message.type === 'read-view')).toHaveLength(1);
    const state = h.controller.getSnapshot();
    const frame = new LiveAnalysis(48000).render(DEFAULT_VIEW, 500);
    h.reply({ type: 'view', sessionId: sessionId - 1, frame, pitch: [], formants: [] });
    expect(h.controller.getView()).toBeNull();
    h.reply({ type: 'view', sessionId, frame, pitch: [], formants: [] });
    expect(h.controller.getView()).toBe(frame);
    expect(h.controller.getSnapshot()).toBe(state);
    await vi.advanceTimersByTimeAsync(34);
    h.controller.requestView(DEFAULT_VIEW, 500);
    expect(h.worker.postMessage.mock.calls.filter(([message]) => message.type === 'read-view')).toHaveLength(2);
    h.controller.stop();
    expect(h.controller.getView()).toBe(frame);
  });
});
