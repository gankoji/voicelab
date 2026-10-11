import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('application foundation', () => {
  it('identifies the starter honestly instead of presenting simulated analysis', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Voice Lab' })).toBeInTheDocument();
    expect(screen.getByText(/not a working analyzer yet/)).toBeInTheDocument();
    expect(screen.getByText(/Microphone inactive/)).toBeInTheDocument();
  });

  it('names both planned views and the required second-phase tracking', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Spectrogram' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waveform' })).toBeInTheDocument();
    expect(screen.getByText('Required · Phase 2')).toBeInTheDocument();
    expect(screen.getByText(/F0 frequency.*F1–F3/)).toBeInTheDocument();
  });
});
