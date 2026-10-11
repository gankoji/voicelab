import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { CaptureController, CaptureStatus } from '../audio/capture-controller';

const statusLabels: Record<CaptureStatus, string> = {
  idle: 'Ready',
  requesting: 'Connecting…',
  running: 'Live · mic on',
  stopped: 'Stopped',
  error: 'Mic unavailable',
};

function formatLevel(value: number | undefined) {
  if (value === undefined) return '—';
  return value === -Infinity ? '−∞ dBFS' : `${value.toFixed(1)} dBFS`;
}

function processingLabel(value: boolean | string | undefined) {
  if (typeof value === 'string') return `On (${value})`;
  return value === undefined ? 'Unknown' : value ? 'On' : 'Off';
}

export function MicrophonePanel({ controller, settingsOpen, onSettingsChange, children }: {
  controller: CaptureController;
  settingsOpen: boolean;
  onSettingsChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const capture = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const active = capture.status === 'requesting' || capture.status === 'running';
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onSettingsChange(false);
      settingsButton.current?.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onSettingsChange, settingsOpen]);

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
  const showNotice = capture.status === 'error' || capture.status === 'requesting'
    || (capture.status === 'stopped' && capture.message !== 'Microphone stopped — no audio is being captured.');

  return (
    <>
      <section className="capture-toolbar" aria-label="Capture controls">
        <div className="transport-row">
          <button
            type="button"
            className={active ? 'record-button is-active' : 'record-button'}
            title={active ? 'Stop microphone capture' : 'Analyze live microphone input — not saved'}
            onClick={() => active ? controller.stop() : void controller.start(deviceId)}
          >
            <span className={active ? 'stop-icon' : 'record-icon'} aria-hidden="true" />
            {active ? 'Stop' : 'Record'}
          </button>
          <span role="status" aria-label="Capture status" className={active ? 'capture-indicator active' : 'capture-indicator'}
            title={capture.details?.deviceLabel ?? capture.message}>
            {statusLabels[capture.status]}
          </span>
          <div className="meters" aria-label="Digital input levels">
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
          </div>
          <button ref={settingsButton} type="button" className="settings-button"
            aria-expanded={settingsOpen} aria-controls="analysis-settings"
            onClick={() => onSettingsChange(!settingsOpen)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 7h16M4 17h16" />
              <circle cx="9" cy="7" r="3" fill="currentColor" />
              <circle cx="15" cy="17" r="3" fill="currentColor" />
            </svg>
            Settings
          </button>
        </div>
        {showNotice && <p role={capture.status === 'error' ? 'alert' : 'status'} className="capture-message">{capture.message}</p>}
        {reading?.nearClipping && <p className="clip-warning" role="alert">Near digital clipping — lower your microphone input gain.</p>}
        {Boolean(reading?.droppedSamples) && <p className="clip-warning">Audio gaps detected: {reading?.droppedSamples} samples were not processed.</p>}
      </section>

      <aside id="analysis-settings" className="settings-panel panel" aria-label="Settings" hidden={!settingsOpen}>
        <div className="settings-heading">
          <h2>Settings</h2>
          <button ref={closeButton} type="button" className="close-button" aria-label="Close settings"
            onClick={() => { onSettingsChange(false); settingsButton.current?.focus(); }}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <section className="input-settings" aria-labelledby="input-heading">
          <h3 id="input-heading">Input</h3>
          <label htmlFor="microphone-input">Audio input</label>
          <select id="microphone-input" value={deviceId} disabled={capture.status === 'requesting'}
            onChange={(event) => {
              if (active) controller.stop('Input changed. Press Record to use it.');
              setDeviceId(event.target.value);
            }}>
            <option value="">Default input</option>
            {devices.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
            ))}
          </select>
          {deviceError && <p className="capture-note">{deviceError}</p>}
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
          <p className="capture-note">
            Record starts live analysis, not a saved recording. No speaker monitoring.
            Capture stops when you hide this page. Input names may appear after permission is granted.
            Levels are digital dBFS, not calibrated SPL.
          </p>
        </section>
        {children}
      </aside>
    </>
  );
}
