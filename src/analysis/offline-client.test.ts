import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeOffline } from './offline-client';

afterEach(() => vi.unstubAllGlobals());

describe('offline worker client', () => {
  it('reports progress and terminates on cancellation', async () => {
    const terminate = vi.fn();
    let instance: { onmessage: ((event: { data: unknown }) => void) | null } | undefined;
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage = vi.fn();
      terminate = terminate;
      constructor() { instance = this; }
    });
    const abort = new AbortController();
    const progress = vi.fn();
    const result = analyzeOffline(new Float32Array(1), 48000, { signal: abort.signal, onProgress: progress });
    instance!.onmessage!({ data: { type: 'progress', progress: 0.5 } });
    expect(progress).toHaveBeenCalledWith(0.5);
    abort.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminate).toHaveBeenCalledOnce();
  });
});
