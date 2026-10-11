import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CaptureController, CaptureStatus } from '../audio/capture-controller';

const statusLabels: Record<CaptureStatus, string> = {
  idle: 'Microphone off',
  requesting: 'Starting microphone',
  running: 'Microphone on',
  stopped: 'Microphone off',
  error: 'Capture unavailable',
};

function formatLevel(value: number | undefined) {
  if (value === undefined) return '—';
  return value === -Infinity ? '−∞ dBFS' : `${value.toFixed(1)} dBFS`;
}

function processingLabel(value: boolean | string | undefined) {
  if (typeof value === 'string') return `On (${value})`;
  return value === undefined ? 'Unknown' : value ? 'On' : 'Off';
}

export function MicrophonePanel({ controller }: { controller: CaptureController }) {
  const capture = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const active = capture.status === 'requesting' || capture.status === 'running';

  useEffect(() => {
    const pageHidden = () => {
      const status = controller.getSnapshot().status;
      if (status === 'requesting' || status === 'running') {
        controller.stop('Microphone stopped when this page was hidden. Start again when you are ready.');
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') pageHidden();
    };
    window.addEventListener('pagehide', pageHidden);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      window.removeEventListener('pagehide', pageHidden);
      document.removeEventListener('visibilitychange', visibilityChanged);
      const status = controller.getSnapshot().status;
      if (status === 'running' || status === 'requesting') controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    let cancelled = false;
    let refreshId = 0;
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;
    const refresh = async () => {
      const id = ++refreshId;
      try {
        const available = (await mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
        if (cancelled || id !== refreshId) return;
        setDevices(available);
        setDeviceError('');
        if (deviceId && !available.some((device) => device.deviceId === deviceId)) {
          setDeviceId('');
          if (active) controller.stop('The selected input is no longer available. Choose an input and start again.');
        }
      } catch {
        if (!cancelled && id === refreshId) setDeviceError('Input names could not be refreshed. You can still try Default input.');
      }
    };
    void refresh();
    mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      mediaDevices.removeEventListener('devicechange', refresh);
    };
  }, [active, capture.status, controller, deviceId]);

  const reading = capture.reading;
  const settings = capture.details?.trackSettings;
  const processingUncertain = settings && [
    settings.autoGainControl, settings.echoCancellation, settings.noiseSuppression,
  ].some((value) => value !== false);

  return (
    <section className="capture panel" aria-labelledby="capture-heading">
      <div className="panel-heading">
        <h2 id="capture-heading">Microphone</h2>
        <span className={active ? 'capture-indicator active' : 'capture-indicator'}>
          {statusLabels[capture.status]}
        </span>
      </div>
      <div className="capture-body">
        <div className="capture-controls">
          <div className="input-choice">
            <label htmlFor="microphone-input">Audio input</label>
            <select
              id="microphone-input"
              value={deviceId}
              disabled={capture.status === 'requesting'}
              onChange={(event) => {
                if (active) controller.stop('Input changed. Press Start microphone to use it.');
                setDeviceId(event.target.value);
              }}
            >
              <option value="">Default input</option>
              {devices.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={active ? 'stop-button' : ''}
            onClick={() => active ? controller.stop() : void controller.start(deviceId)}
          >
            {active ? 'Stop microphone' : 'Start microphone'}
          </button>
        </div>
        <p role={capture.status === 'error' ? 'alert' : 'status'} className="capture-message">
          {capture.message}
        </p>
        {deviceError && <p className="capture-note">{deviceError}</p>}

        <div className="meters">
          <div className="level-row">
            <label htmlFor="peak-meter">Peak</label>
            <meter id="peak-meter" min={-60} max={0} value={Math.min(0, Math.max(-60, reading?.peakDbfs ?? -60))}
              aria-valuetext={formatLevel(reading?.peakDbfs)} />
            <output aria-label="Peak level" aria-live="off">{formatLevel(reading?.peakDbfs)}</output>
          </div>
          <div className="level-row">
            <label htmlFor="rms-meter">RMS</label>
            <meter id="rms-meter" min={-60} max={0} value={Math.min(0, Math.max(-60, reading?.rmsDbfs ?? -60))}
              aria-valuetext={formatLevel(reading?.rmsDbfs)} />
            <output aria-label="RMS level" aria-live="off">{formatLevel(reading?.rmsDbfs)}</output>
          </div>
          <p className={reading?.nearClipping ? 'clip-warning' : 'capture-note'}>
            {reading?.nearClipping
              ? 'Near digital clipping — lower your microphone input gain.'
              : 'Digital levels · meter range −60 to 0 dBFS · not calibrated SPL'}
          </p>
        </div>

        {capture.details && settings && (
          <details className="capture-details">
            <summary>Capture details and processing</summary>
            <dl>
              <dt>Input</dt><dd>{capture.details.deviceLabel}</dd>
              <dt>Analysis sample rate</dt><dd>{capture.details.sampleRate.toLocaleString()} Hz</dd>
              <dt>Reported input sample rate</dt><dd>{settings.sampleRate ? `${settings.sampleRate.toLocaleString()} Hz` : 'Unknown'}</dd>
              <dt>Reported input channels</dt><dd>{settings.channelCount ?? 'Unknown'} (analysis is mono)</dd>
              <dt>Automatic gain control</dt><dd>{processingLabel(settings.autoGainControl)}</dd>
              <dt>Noise suppression</dt><dd>{processingLabel(settings.noiseSuppression)}</dd>
              <dt>Echo cancellation</dt><dd>{processingLabel(settings.echoCancellation)}</dd>
              <dt>Processed samples</dt><dd><output aria-label="Processed samples" aria-live="off">{reading?.receivedSamples ?? 0}</output></dd>
              <dt>Dropped samples</dt><dd><output aria-label="Dropped samples" aria-live="off">{reading?.droppedSamples ?? 0}</output></dd>
            </dl>
            <p className="capture-note">
              {processingUncertain
                ? 'Some browser processing is on or unknown. Measurements may be affected.'
                : 'The browser reports processing off. Hardware or operating-system processing may still apply.'}
            </p>
          </details>
        )}
        {Boolean(reading?.droppedSamples) && (
          <p className="clip-warning">Audio gaps detected: {reading?.droppedSamples} samples were not processed.</p>
        )}
        <p className="capture-note">
          No speaker monitoring. Capture stops when you leave or hide this page.
          Input names may appear after permission is granted.
        </p>
      </div>
    </section>
  );
}
