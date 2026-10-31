export type PlaybackStatus = 'idle' | 'starting' | 'playing' | 'stopped' | 'ended' | 'error';

export interface PlaybackCallbacks {
  onStatus?: (status: PlaybackStatus, error?: unknown) => void;
  onEnded?: () => void;
}

interface Session {
  context: AudioContext;
  source?: AudioBufferSourceNode;
  closed: boolean;
}

/**
 * Plays a half-open sample interval [start, end). Call play directly from a
 * user gesture: creating/resuming an AudioContext may require activation.
 * Each play owns its context and replaces any previous playback.
 */
export class PlaybackEngine {
  private session: Session | null = null;
  private currentStatus: PlaybackStatus = 'idle';

  constructor(
    private readonly callbacks: PlaybackCallbacks = {},
    private readonly createContext: () => AudioContext = () => new AudioContext(),
  ) {}

  get status(): PlaybackStatus {
    return this.currentStatus;
  }

  async play(samples: Float32Array, sampleRate: number, start = 0, end = samples.length): Promise<void> {
    if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate <= 0 ||
        !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > samples.length || start >= end) {
      throw new RangeError('Expected a non-empty sample interval and a positive finite sample rate.');
    }

    this.stop();
    let session: Session | null = null;
    try {
      const context = this.createContext();
      session = { context, closed: false };
      this.session = session;
      this.setStatus('starting');
      // Invoke resume before the first await, while the caller's gesture is active.
      if (context.state !== 'running') await context.resume();
      if (this.session !== session) return;
      if (context.state !== 'running') throw new Error('Audio playback was not allowed to start. Try again from a user gesture.');

      const buffer = context.createBuffer(1, end - start, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = start; i < end; i++) {
        const sample = samples[i]!;
        channel[i - start] = Number.isFinite(sample) ? sample : 0;
      }
      const source = context.createBufferSource();
      session.source = source;
      const activeSession = session;
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (this.session !== activeSession) return;
        this.session = null;
        this.cleanup(activeSession);
        this.setStatus('ended');
        this.callbacks.onEnded?.();
      };
      source.start();
      this.setStatus('playing');
    } catch (error) {
      if (session && this.session !== session) return;
      this.session = null;
      if (session) this.cleanup(session);
      this.setStatus('error', error);
      throw error;
    }
  }

  stop(): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.cleanup(session);
    this.setStatus('stopped');
  }

  private cleanup(session: Session): void {
    if (session.closed) return;
    session.closed = true;
    if (session.source) {
      session.source.onended = null;
      try { session.source.stop(); } catch { /* Source may already have ended. */ }
      session.source.disconnect();
    }
    void session.context.close().catch(() => {});
  }

  private setStatus(status: PlaybackStatus, error?: unknown): void {
    this.currentStatus = status;
    this.callbacks.onStatus?.(status, error);
  }
}
