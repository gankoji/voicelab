import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('capture application', () => {
  it('distinguishes working capture from the upcoming plots', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Voice Lab' })).toBeInTheDocument();
    expect(screen.getByText(/exports are still in development/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
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
