/** Four reusable blocks bound the audio queue to ~171 ms at 48 kHz. */
export const BLOCK_SIZE = 2048;
export const BUFFER_COUNT = 4;
export const METER_INTERVAL_MS = 100;

export interface SampleBlock {
  type: 'samples';
  sessionId: number;
  firstSample: number;
  samples: Float32Array<ArrayBuffer>;
}

export interface RecycledBlock {
  type: 'recycle';
  sessionId: number;
  samples: Float32Array<ArrayBuffer>;
}

export interface PipelineInit {
  type: 'init';
  sessionId: number;
  sampleRate: number;
  port: MessagePort;
}

export interface MeterRequest {
  type: 'read-meter';
  sessionId: number;
}

export interface MeterReading {
  /** Levels across samples received since the previous read, not smoothed dB. */
  peakDbfs: number;
  rmsDbfs: number;
  nearClipping: boolean;
  endSample: number;
  receivedSamples: number;
  droppedSamples: number;
}

export type WorkerReply =
  | { type: 'ready'; sessionId: number }
  | { type: 'meter'; sessionId: number; reading: MeterReading | null };
