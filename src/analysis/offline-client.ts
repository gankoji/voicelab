import type { FormantPoint } from './formants';
import type { PitchPoint } from './pitch';

export function analyzeOffline(
  samples: Float32Array<ArrayBuffer>,
  sampleRate: number,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<{ samples: Float32Array<ArrayBuffer>; pitch: PitchPoint[]; formants: FormantPoint[] }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Analysis cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./offline.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Analysis cancelled', 'AbortError'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event) => {
      if (event.data.type === 'progress') {
        options.onProgress?.(event.data.progress);
        return;
      }
      cleanup();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(event.error ?? new Error(event.message || 'Offline analysis worker failed'));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('Offline analysis worker message could not be decoded'));
    };
    try {
      worker.postMessage({ samples, sampleRate }, [samples.buffer]);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
