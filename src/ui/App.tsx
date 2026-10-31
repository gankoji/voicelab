import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CaptureController } from '../audio/capture-controller';
import type { ViewSettings } from '../analysis/view';
import { FrozenAnalysis } from '../analysis/frozen-analysis';
import { analyzeOffline } from '../analysis/offline-client';
import { importAudio } from '../audio/import-audio';
import { cutSamples, pasteSamples } from '../audio/edit';
import { filterBand } from '../audio/band-filter';
import type { BandFilterMode } from '../audio/band-filter';
import { PlaybackEngine } from '../audio/playback';
import type { PlaybackStatus } from '../audio/playback';
import { buildMetadata, downloadBlob, encodeWav } from '../export/export';
import { encodePlotPng } from '../export/image';
import { APP_NAME, APP_VERSION } from '../app-meta';
import { loadPreferences, savePreferences } from '../settings/preferences';
import { MicrophonePanel } from './MicrophonePanel';
import { VisualizationPanel } from './VisualizationPanel';
import type { FrequencyBand } from './VisualizationPanel';
import { DisplaySettings } from './DisplaySettings';

export interface FrozenView {
  analysis: FrozenAnalysis;
  start: number;
  end: number;
  source?: { kind: 'file'; name: string };
}

export interface TimeSelection {
  analysis: FrozenAnalysis;
  start: number;
  end: number;
}

export function App() {
  const [controller] = useState(() => new CaptureController());
  const capture = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [initialPreferences] = useState(() => loadPreferences(window.localStorage));
  const [settings, setSettings] = useState<ViewSettings>(initialPreferences.settings);
  const [deviceId, setDeviceId] = useState<string>(initialPreferences.deviceId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [frozen, setFrozen] = useState<FrozenView | null>(null);
  const [selection, setSelection] = useState<TimeSelection | null>(null);
  const [frequencyBand, setFrequencyBand] = useState<FrequencyBand | null>(null);
  const [lowHz, setLowHz] = useState('200');
  const [highHz, setHighHz] = useState('1000');
  const [pausePending, setPausePending] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [clipboard, setClipboard] = useState<{ samples: Float32Array; sampleRate: number } | null>(null);
  const [undo, setUndo] = useState<FrozenView | null>(null);
  const [insertion, setInsertion] = useState('0');
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [player] = useState(() => new PlaybackEngine({ onStatus: (status, error) => {
    setPlaybackStatus(status);
    if (status === 'error') setEditMessage(error instanceof Error ? error.message : 'Playback failed.');
  } }));
  const editGeneration = useRef(0);
  const editAbort = useRef<AbortController | null>(null);
  const importGeneration = useRef(0);
  const importAbort = useRef<AbortController | null>(null);
  const pauseLock = useRef(false);
  const spectralCanvas = useRef<HTMLCanvasElement | null>(null);
  const waveCanvas = useRef<HTMLCanvasElement | null>(null);

  // Persist preferences only; never audio or microphone consent.
  useEffect(() => {
    savePreferences({ settings, deviceId }, window.localStorage);
  }, [settings, deviceId]);

  useEffect(() => () => {
    importGeneration.current++; importAbort.current?.abort();
    editGeneration.current++; editAbort.current?.abort();
    player.stop();
  }, [player]);

  const captureSnapshot = async () => {
    const snapshot = await controller.requestSnapshot();
    if (!snapshot || snapshot.samples.length === 0) return null;
    const analysis = new FrozenAnalysis(snapshot.sampleRate, snapshot.samples, settings.fftSize, snapshot.pitch, snapshot.formants);
    const end = analysis.displayEnd;
    const start = Math.max(0, end - settings.historySeconds * snapshot.sampleRate);
    return { analysis, start, end } satisfies FrozenView;
  };

  const togglePause = async () => {
    if (pauseLock.current || capture.status !== 'running') return;
    if (frozen) {
      setFrozen(null);
      return;
    }
    pauseLock.current = true;
    setPausePending(true);
    try {
      const view = await captureSnapshot();
      if (view) setFrozen(view);
    } finally {
      pauseLock.current = false;
      setPausePending(false);
    }
  };

  const stopRecording = async () => {
    if (capture.status !== 'running') {
      controller.stop();
      return;
    }
    if (!frozen) {
      try {
        const view = await captureSnapshot();
        if (view) setFrozen(view);
      } catch {
        // Still release the microphone even if the snapshot could not be read.
      }
    }
    controller.stop();
  };

  const updateFrozenRange = (start: number, end: number) => {
    setFrozen((current) => current ? { ...current, start, end } : current);
  };

  const handleSettingsChange = (next: ViewSettings) => {
    const historyChanged = next.historySeconds !== settings.historySeconds;
    setSettings(next);
    if (frozen && historyChanged) {
      setFrozen((current) => current && {
        ...current,
        start: Math.max(0, current.analysis.displayEnd - next.historySeconds * current.analysis.sampleRate),
        end: current.analysis.displayEnd,
      });
    }
  };

  const startRecording = (deviceId: string) => {
    player.stop();
    setUndo(null);
    importGeneration.current++;
    importAbort.current?.abort();
    setImporting(false);
    setImportMessage('');
    setFrozen(null);
    void controller.start(deviceId);
  };

  const openFile = async (file: File) => {
    player.stop();
    const generation = ++importGeneration.current;
    const abort = new AbortController();
    importAbort.current = abort;
    setImporting(true);
    setImportMessage(`Decoding ${file.name} locally…`);
    try {
      const decoded = await importAudio(file);
      if (generation !== importGeneration.current) return;
      setImportMessage(`Analyzing ${file.name} locally… 0%`);
      const result = await analyzeOffline(decoded.samples, decoded.sampleRate, {
        signal: abort.signal,
        onProgress: (progress) => {
          if (generation === importGeneration.current) setImportMessage(`Analyzing ${file.name} locally… ${Math.round(progress * 100)}%`);
        },
      });
      if (generation !== importGeneration.current) return;
      const analysis = new FrozenAnalysis(decoded.sampleRate, result.samples, settings.fftSize, result.pitch, result.formants, true);
      setFrozen({ analysis, start: 0, end: Math.min(analysis.displayEnd, settings.historySeconds * decoded.sampleRate), source: { kind: 'file', name: file.name } });
      setUndo(null);
      setSelection(null);
      setInsertion('0');
      setImportMessage(`Opened ${file.name} · mixed to mono for analysis.`);
    } catch (error) {
      if (generation !== importGeneration.current) return;
      setImportMessage(error instanceof Error ? error.message : 'Could not import this audio file.');
    } finally {
      if (generation === importGeneration.current) {
        importAbort.current = null;
        setImporting(false);
      }
    }
  };

  const cancelImport = () => {
    importGeneration.current++;
    importAbort.current?.abort();
    importAbort.current = null;
    setImporting(false);
    setImportMessage('Import cancelled.');
  };

  const selected = selection?.analysis === frozen?.analysis ? selection : null;
  const updateFrequencyBand = (band: FrequencyBand | null) => {
    setFrequencyBand(band);
    if (band) {
      setLowHz(band.lowHz.toFixed(1));
      setHighHz(band.highHz.toFixed(1));
    }
  };
  const safeToEdit = !!frozen && capture.status !== 'running' && capture.status !== 'requesting' && !importing && !editing && !pausePending;
  const play = () => {
    if (!frozen) return;
    const samples = frozen.analysis.slice(selected?.start ?? frozen.start, selected?.end ?? frozen.end);
    void player.play(samples, frozen.analysis.sampleRate).catch((error: unknown) => {
      setEditMessage(error instanceof Error ? error.message : 'Playback failed.');
    });
  };
  const copy = () => {
    if (!frozen || !selected) return;
    setClipboard({ samples: frozen.analysis.slice(selected.start, selected.end), sampleRate: frozen.analysis.sampleRate });
    setEditMessage('Selection copied to the in-app clipboard.');
  };
  const commitEditedAudio = async (next: Float32Array<ArrayBuffer>, source: FrozenView) => {
    const analysis = source.analysis;
    player.stop();
    const generation = ++editGeneration.current;
    const abort = new AbortController();
    editAbort.current = abort;
    setEditing(true);
    setEditMessage('Re-analyzing edited audio… 0%');
    try {
      const result = await analyzeOffline(next, analysis.sampleRate, {
        signal: abort.signal,
        onProgress: (progress) => {
          if (generation === editGeneration.current) setEditMessage(`Re-analyzing edited audio… ${Math.round(progress * 100)}%`);
        },
      });
      if (generation !== editGeneration.current) return;
      const updated = new FrozenAnalysis(analysis.sampleRate, result.samples, settings.fftSize, result.pitch, result.formants, true);
      setUndo(source);
      setFrozen({ ...source, analysis: updated, start: 0, end: Math.min(updated.displayEnd, settings.historySeconds * updated.sampleRate) });
      setSelection(null);
      setInsertion('0');
      setEditMessage('Edit complete. The original remains unchanged; Undo restores the previous version.');
    } catch (error) {
      if (generation === editGeneration.current) setEditMessage(error instanceof Error ? error.message : 'Edit analysis failed; audio unchanged.');
    } finally {
      if (generation === editGeneration.current) { editAbort.current = null; setEditing(false); }
    }
  };
  const applyEdit = (kind: 'cut' | 'paste') => {
    if (!safeToEdit || !frozen) return;
    const analysis = frozen.analysis;
    const original = analysis.slice(0, analysis.endSample);
    let next: Float32Array<ArrayBuffer>;
    if (kind === 'cut') {
      if (!selected || selected.end - selected.start >= original.length) {
        setEditMessage('Select less than the entire recording to cut.');
        return;
      }
      const start = Math.round(selected.start), end = Math.round(selected.end);
      setClipboard({ samples: original.slice(start, end), sampleRate: analysis.sampleRate });
      next = cutSamples(original, start, end);
    } else {
      const position = Number(insertion);
      if (!clipboard || clipboard.sampleRate !== analysis.sampleRate || insertion.trim() === '' ||
          !Number.isInteger(position) || position < 0 || position > original.length) {
        setEditMessage('Enter a valid insertion sample; clipboard and recording must have the same sample rate.');
        return;
      }
      next = pasteSamples(original, clipboard.samples, position);
    }
    void commitEditedAudio(next, frozen);
  };
  const applyBand = (mode: BandFilterMode) => {
    if (!safeToEdit || !frozen || !frequencyBand) return;
    try {
      const analysis = frozen.analysis;
      const original = analysis.slice(0, analysis.endSample);
      const start = Math.round(selected?.start ?? frozen.start);
      const end = Math.round(selected?.end ?? frozen.end);
      const next = filterBand(original, analysis.sampleRate, start, end, frequencyBand.lowHz, frequencyBand.highHz, mode);
      void commitEditedAudio(next, frozen);
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : 'Could not filter this interval.');
    }
  };
  const cancelEdit = () => {
    editGeneration.current++;
    editAbort.current?.abort();
    editAbort.current = null;
    setEditing(false);
    setEditMessage('Edit cancelled; audio unchanged.');
  };

  const exportSnapshot = async () => {
    if (!frozen) return;
    const audio = frozen.analysis.slice(frozen.start, frozen.end);
    const wav = encodeWav(audio, frozen.analysis.sampleRate);
    const metadata = buildMetadata({
      app: APP_NAME, version: APP_VERSION, exportedAt: new Date().toISOString(),
      sampleRate: frozen.analysis.sampleRate,
      startSample: frozen.start, endSample: frozen.end, sampleCount: audio.length,
      settings, pitch: frozen.analysis.pitchRange(frozen.start, frozen.end),
      formants: frozen.analysis.formantRange(frozen.start, frozen.end),
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([wav], { type: 'audio/wav' }), `${APP_NAME}-${stamp}.wav`);
    downloadBlob(new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }), `${APP_NAME}-${stamp}.json`);
    if (spectralCanvas.current && waveCanvas.current) {
      try {
        const png = await encodePlotPng(spectralCanvas.current, waveCanvas.current);
        downloadBlob(png, `${APP_NAME}-${stamp}.png`);
      } catch {
        // Audio and metadata already downloaded; a plot-image failure should not block them.
      }
    }
  };

  const headerText = frozen?.source?.kind === 'file'
    ? `Imported · ${frozen.source.name}`
    : frozen
    ? (capture.status === 'running' ? 'Paused · live capture continues' : 'Paused · recording stopped')
    : 'Live voice analysis';

  return (
    <main className={settingsOpen ? 'app settings-open' : 'app'}>
      <header className="app-header">
        <h1>Voice Lab</h1>
        <span>{headerText}</span>
        <a className="help-link" href={`${import.meta.env.BASE_URL}guide/index.html`} target="_blank" rel="noopener noreferrer"
          title="Opens in a new tab. Switching tabs stops microphone capture."
          onClick={(event) => {
            if ((capture.status === 'running' || capture.status === 'requesting') &&
                !window.confirm('Switching tabs stops the microphone. Open the guide in a new tab?')) event.preventDefault();
          }}>
          Help & guide <span aria-hidden="true">↗</span>
        </a>
      </header>

      <MicrophonePanel
        controller={controller}
        settingsOpen={settingsOpen}
        onSettingsChange={setSettingsOpen}
        frozen={frozen !== null}
        pausePending={pausePending}
        deviceId={deviceId}
        onDeviceChange={setDeviceId}
        onPauseToggle={() => void togglePause()}
        onStop={() => void stopRecording()}
        onRecord={startRecording}
        onExport={() => void exportSnapshot()}
        onImport={(file) => void openFile(file)}
        importing={importing}
        importMessage={importMessage}
        onCancelImport={cancelImport}
        editing={editing}
      >
        <DisplaySettings controller={controller} settings={settings} onChange={handleSettingsChange} frozen={frozen !== null} sampleRate={frozen?.analysis.sampleRate} />
      </MicrophonePanel>

      {frozen && <details className="edit-controls">
        <summary>Playback and editing</summary>
        <div className="edit-buttons">
          <button type="button" onClick={play} disabled={!safeToEdit || playbackStatus === 'starting'}>Play {selected ? 'selection' : 'view'}</button>
          <button type="button" onClick={() => player.stop()} disabled={playbackStatus !== 'playing' && playbackStatus !== 'starting'}>Stop playback</button>
          <button type="button" onClick={copy} disabled={!safeToEdit || !selected}>Copy selection</button>
          <button type="button" onClick={() => void applyEdit('cut')} disabled={!safeToEdit || !selected}>Cut selection</button>
          <label htmlFor="paste-position">Paste at sample</label>
          <input id="paste-position" type="number" min="0" max={frozen.analysis.endSample} step="1" value={insertion} onChange={(event) => setInsertion(event.target.value)} disabled={!safeToEdit} />
          <button type="button" disabled={!safeToEdit || !selected} onClick={() => selected && setInsertion(String(selected.start))}>Use selection start</button>
          <button type="button" disabled={!safeToEdit || !selected} onClick={() => selected && setInsertion(String(selected.end))}>Use selection end</button>
          <button type="button" onClick={() => void applyEdit('paste')} disabled={!safeToEdit || !clipboard}>Paste</button>
          <button type="button" disabled={!safeToEdit || !undo} onClick={() => {
            if (!undo) return;
            player.stop(); setFrozen(undo); setUndo(null); setSelection(null); setInsertion('0');
            setEditMessage('Previous version restored.');
          }}>Undo edit</button>
          {editing && <button type="button" onClick={cancelEdit}>Cancel edit</button>}
        </div>
        <p>Selection or visible view plays; gaps play as silence. Paste position is a zero-based sample index. Edits affect an in-memory copy only.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const low = Number(lowHz), high = Number(highHz);
          if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || low >= high || high >= frozen.analysis.sampleRate / 2) {
            setEditMessage('Enter a positive frequency band below the Nyquist frequency.');
            return;
          }
          updateFrequencyBand({ lowHz: low, highHz: high });
          setEditMessage('Frequency band selected.');
        }} className="edit-buttons">
          <label>Low frequency (Hz) <input type="number" min="1" step="any" value={lowHz} onChange={(event) => { setLowHz(event.target.value); setFrequencyBand(null); }} /></label>
          <label>High frequency (Hz) <input type="number" min="1" step="any" value={highHz} onChange={(event) => { setHighHz(event.target.value); setFrequencyBand(null); }} /></label>
          <button type="submit">Set frequency band</button>
          <button type="button" disabled={!safeToEdit || !frequencyBand} onClick={() => applyBand('keep')}>Keep band</button>
          <button type="button" disabled={!safeToEdit || !frequencyBand} onClick={() => applyBand('reduce')}>Reduce band</button>
        </form>
        <p>The filter applies to the time selection, or the visible view if none is selected. It changes an in-memory copy; Undo restores the previous version. Band edges are gradual, not brick-wall cuts; boundary clicks and phase or level changes are possible.</p>
        <p role="status">{editMessage}</p>
      </details>}

      <VisualizationPanel
        controller={controller}
        settings={settings}
        frozen={frozen}
        selection={selection?.analysis === frozen?.analysis ? selection : null}
        onSelectionChange={setSelection}
        frequencyBand={frequencyBand}
        onFrequencyBandChange={updateFrequencyBand}
        onFrozenRangeChange={updateFrozenRange}
        spectralCanvas={spectralCanvas}
        waveCanvas={waveCanvas}
      />

      <footer>
        <span>Audio stays on this device. Nothing is saved.</span>
        <span>Pause or stop to export WAV and settings</span>
      </footer>
    </main>
  );
}
