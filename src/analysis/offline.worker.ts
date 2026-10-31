import { analyzeOfflineCore } from './offline-core';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ samples: Float32Array<ArrayBuffer>; sampleRate: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = ({ data: { samples, sampleRate } }) => {
  const result = analyzeOfflineCore(samples, sampleRate, (progress) => {
    scope.postMessage({ type: 'progress', progress }, []);
  });
  scope.postMessage({ type: 'complete', samples, ...result }, [samples.buffer]);
};
