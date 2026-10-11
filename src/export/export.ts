import type { ViewSettings } from '../analysis/view';

const WAV_BYTES_PER_SAMPLE = 2;
const WAV_CHANNELS = 1;

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Mono 16-bit PCM WAV. NaN gaps in the snapshot are exported as digital silence. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const frameCount = samples.length;
  const dataBytes = frameCount * WAV_BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, WAV_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(32, WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    const value = samples[i]!;
    const clamped = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    view.setInt16(offset, Math.round(clamped * 32767), true);
    offset += WAV_BYTES_PER_SAMPLE;
  }
  return buffer;
}

export interface ExportMetadata {
  app: string;
  version: string;
  exportedAt: string;
  sampleRate: number;
  range: {
    startSample: number;
    endSample: number;
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
  };
  sampleCount: number;
  settings: ViewSettings;
  format: { encoding: 'PCM16'; channels: 1; bytesPerSample: 2; byteOrder: 'little-endian' };
}

export function buildMetadata(input: {
  app: string;
  version: string;
  exportedAt: string;
  sampleRate: number;
  startSample: number;
  endSample: number;
  sampleCount: number;
  settings: ViewSettings;
}): ExportMetadata {
  const { sampleRate, startSample, endSample } = input;
  return {
    app: input.app,
    version: input.version,
    exportedAt: input.exportedAt,
    sampleRate,
    range: {
      startSample,
      endSample,
      startSeconds: startSample / sampleRate,
      endSeconds: endSample / sampleRate,
      durationSeconds: (endSample - startSample) / sampleRate,
    },
    sampleCount: input.sampleCount,
    settings: input.settings,
    format: { encoding: 'PCM16', channels: 1, bytesPerSample: 2, byteOrder: 'little-endian' },
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
