import { afterEach, describe, expect, it, vi } from 'vitest';
import { importAudio } from './import-audio';

afterEach(() => vi.unstubAllGlobals());

describe('local audio import', () => {
  const file = (size = 10) => ({ size, arrayBuffer: async () => new ArrayBuffer(size) }) as File;

  it('mixes channels equally and closes the decoding context', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const decodeAudioData = vi.fn().mockResolvedValue({
      length: 2, duration: 2 / 48000, sampleRate: 48000, numberOfChannels: 2,
      getChannelData: (channel: number) => channel === 0 ? new Float32Array([1, 0.5]) : new Float32Array([-1, 0.5]),
    });
    vi.stubGlobal('AudioContext', class { decodeAudioData = decodeAudioData; close = close; });
    const result = await importAudio(file());
    expect(Array.from(result.samples)).toEqual([0, 0.5]);
    expect(result.sampleRate).toBe(48000);
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not reject recordings based on file size or duration', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const decodeAudioData = vi.fn().mockResolvedValue({
      length: 1, duration: 121, sampleRate: 48000, numberOfChannels: 1,
      getChannelData: () => new Float32Array([0.5]),
    });
    const create = vi.fn(function () { return { decodeAudioData, close }; });
    vi.stubGlobal('AudioContext', create);
    const largeFile = { ...file(), size: 26 * 1024 * 1024 } as File;
    await expect(importAudio(largeFile)).resolves.toMatchObject({ sampleRate: 48000 });
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports decode failures and releases the context', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = vi.fn().mockRejectedValue(new Error('bad data'));
      close = close;
    });
    await expect(importAudio(file())).rejects.toThrow('Could not decode');
    expect(close).toHaveBeenCalledOnce();
  });
});
