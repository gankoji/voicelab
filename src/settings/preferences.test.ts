import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VIEW } from '../analysis/view';
import { loadPreferences, savePreferences } from './preferences';
import type { Preferences } from './preferences';

const KEY = 'voice-lab.preferences.v1';

describe('preference persistence', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults when nothing is stored', () => {
    expect(loadPreferences(localStorage)).toEqual({ settings: DEFAULT_VIEW, deviceId: '' });
  });

  it('round-trips display settings and the chosen device', () => {
    const preferences: Preferences = {
      settings: { ...DEFAULT_VIEW, historySeconds: 5, frequencyScale: 'log', showRms: true },
      deviceId: 'mic-123',
    };
    savePreferences(preferences, localStorage);
    expect(loadPreferences(localStorage)).toEqual(preferences);
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(KEY, '{not valid json');
    expect(loadPreferences(localStorage)).toEqual({ settings: DEFAULT_VIEW, deviceId: '' });
  });

  it('fills missing settings fields and clamps out-of-range values', () => {
    localStorage.setItem(KEY, JSON.stringify({
      settings: { historySeconds: 99999, maxFrequency: 4, floorDb: 500 },
      deviceId: 42,
    }));
    const preferences = loadPreferences(localStorage);
    expect(preferences.settings.historySeconds).toBe(30);
    expect(preferences.settings.maxFrequency).toBe(40);
    expect(preferences.settings.floorDb).toBeLessThan(preferences.settings.ceilingDb);
    expect(preferences.settings.showRms).toBe(DEFAULT_VIEW.showRms);
    expect(preferences.deviceId).toBe('');
  });
});
