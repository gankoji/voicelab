import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

// Accelerated DSP stress check, not an end-to-end real-time browser soak.
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
try {
  const { LiveAnalysis } = await server.ssrLoadModule('/src/analysis/live-analysis.ts');
  const { DEFAULT_VIEW } = await server.ssrLoadModule('/src/analysis/view.ts');
  const sampleRate = 48000;
  const analysis = new LiveAnalysis(sampleRate);
  const block = Float32Array.from({ length: 1024 }, (_, n) => 0.25 * Math.sin(2 * Math.PI * 8 * n / 1024));
  const retainedBytes = analysis.retainedBytes;
  const start = performance.now();
  const durationSeconds = 30 * 60;
  for (let n = 0; n < durationSeconds * sampleRate; n += block.length) analysis.append(block, n);
  const elapsed = performance.now() - start;
  const renderTimes = [];
  for (let n = 0; n < 60; n++) {
    const before = performance.now();
    const frame = analysis.render({ ...DEFAULT_VIEW, historySeconds: 30, showRms: true }, 1024);
    renderTimes.push(performance.now() - before);
    if (frame.maximum.every((value) => !Number.isFinite(value))) throw new Error('History lost after wrapping');
  }
  if (analysis.retainedBytes !== retainedBytes) throw new Error('Retained storage grew during the session');
  renderTimes.sort((a, b) => a - b);
  console.log(JSON.stringify({
    scope: 'Accelerated DSP only; not hardware capture, drawing, GC plateau, or end-to-end latency',
    sampleRate,
    simulatedSeconds: durationSeconds,
    processingMilliseconds: Math.round(elapsed),
    retainedHistoryBytes: retainedBytes,
    fullHistoryRasterMilliseconds: {
      median: Number(renderTimes[30].toFixed(2)),
      p95: Number(renderTimes[57].toFixed(2)),
    },
  }, null, 2));
} finally {
  await server.close();
}
