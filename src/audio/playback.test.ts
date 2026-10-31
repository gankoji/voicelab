import { describe, expect, it, vi } from 'vitest';
import { PlaybackEngine } from './playback';

function mockContext(state: AudioContextState = 'running') {
  const source = {
    buffer: null as AudioBuffer | null,
    onended: null as (() => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  let channel = new Float32Array();
  const context = {
    state,
    destination: {},
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => {}),
    createBuffer: vi.fn((_channels: number, length: number, _rate: number) => {
      channel = new Float32Array(length);
      return { getChannelData: () => channel };
    }),
    createBufferSource: vi.fn(() => source),
  };
  return { context, source, channel: () => channel, factory: () => context as unknown as AudioContext };
}

describe('PlaybackEngine', () => {
  it('plays only the selected interval at the recording rate, replacing gaps with silence', async () => {
    const mock = mockContext();
    const statuses = vi.fn();
    const engine = new PlaybackEngine({ onStatus: statuses }, mock.factory);
    await engine.play(new Float32Array([9, 0.5, NaN, Infinity, -Infinity, -0.5, 8]), 44100, 1, 6);
    expect(mock.context.createBuffer).toHaveBeenCalledWith(1, 5, 44100);
    expect([...mock.channel()]).toEqual([0.5, 0, 0, 0, -0.5]);
    expect(mock.source.connect).toHaveBeenCalledWith(mock.context.destination);
    expect(mock.source.start).toHaveBeenCalledOnce();
    expect(statuses.mock.calls.map(([status]) => status)).toEqual(['starting', 'playing']);
  });

  it('cleans up and reports natural completion once', async () => {
    const mock = mockContext();
    const ended = vi.fn();
    const engine = new PlaybackEngine({ onEnded: ended }, mock.factory);
    await engine.play(new Float32Array([1]), 48000);
    const callback = mock.source.onended!;
    callback();
    callback();
    expect(engine.status).toBe('ended');
    expect(ended).toHaveBeenCalledOnce();
    expect(mock.source.disconnect).toHaveBeenCalledOnce();
    expect(mock.context.close).toHaveBeenCalledOnce();
  });

  it('stops and replaces playback without reporting a natural end', async () => {
    const first = mockContext();
    const second = mockContext();
    const ended = vi.fn();
    const factory = vi.fn().mockImplementationOnce(first.factory).mockImplementationOnce(second.factory);
    const engine = new PlaybackEngine({ onEnded: ended }, factory);
    await engine.play(new Float32Array([1]), 48000);
    const staleEnd = first.source.onended!;
    await engine.play(new Float32Array([2]), 48000);
    staleEnd();
    expect(engine.status).toBe('playing');
    engine.stop();
    engine.stop();
    expect(engine.status).toBe('stopped');
    expect(first.context.close).toHaveBeenCalledOnce();
    expect(second.context.close).toHaveBeenCalledOnce();
    expect(ended).not.toHaveBeenCalled();
  });

  it('resumes synchronously and cancels a pending start on stop', async () => {
    const mock = mockContext('suspended');
    let resolve!: () => void;
    mock.context.resume.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
    const engine = new PlaybackEngine({}, mock.factory);
    const pending = engine.play(new Float32Array([1]), 48000);
    expect(mock.context.resume).toHaveBeenCalledOnce();
    engine.stop();
    resolve();
    await pending;
    expect(mock.source.start).not.toHaveBeenCalled();
    expect(mock.context.close).toHaveBeenCalledOnce();
  });

  it('reports resume errors and releases resources', async () => {
    const mock = mockContext('suspended');
    const error = new Error('blocked');
    mock.context.resume.mockRejectedValue(error);
    const onStatus = vi.fn();
    const engine = new PlaybackEngine({ onStatus }, mock.factory);
    await expect(engine.play(new Float32Array([1]), 48000)).rejects.toBe(error);
    expect(onStatus).toHaveBeenLastCalledWith('error', error);
    expect(mock.context.close).toHaveBeenCalledOnce();
  });

  it('rejects invalid intervals and sample rates before creating a context', async () => {
    const factory = vi.fn();
    const engine = new PlaybackEngine({}, factory);
    const samples = new Float32Array([1, 2]);
    for (const [rate, start, end] of [[0, 0, 1], [NaN, 0, 1], [48000, -1, 1], [48000, 0, 3], [48000, 1, 1], [48000, 0.5, 1]] as [number, number, number][]) {
      await expect(engine.play(samples, rate, start, end)).rejects.toThrow(RangeError);
    }
    expect(factory).not.toHaveBeenCalled();
  });
});
