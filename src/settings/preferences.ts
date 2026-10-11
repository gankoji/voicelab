import { DEFAULT_VIEW, normalizeView } from '../analysis/view';
import type { ViewSettings } from '../analysis/view';

export interface Preferences {
  settings: ViewSettings;
  deviceId: string;
}

const STORAGE_KEY = 'voice-lab.preferences.v1';

/** Analysis runs at a fixed 48 kHz, so this is a stable basis for validating persisted range fields. */
const VALIDATION_SAMPLE_RATE = 48000;

export function loadPreferences(storage: Storage): Preferences {
  const defaults: Preferences = { settings: DEFAULT_VIEW, deviceId: '' };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Preferences> & { version?: number };
    const settings = normalizeView({ ...DEFAULT_VIEW, ...parsed.settings }, VALIDATION_SAMPLE_RATE);
    return {
      settings,
      deviceId: typeof parsed.deviceId === 'string' ? parsed.deviceId : '',
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences: Preferences, storage: Storage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, settings: preferences.settings, deviceId: preferences.deviceId,
    }));
  } catch {
    // Best-effort: private browsing, quota, or disabled storage must not break the app.
  }
}
