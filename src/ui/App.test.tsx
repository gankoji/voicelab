import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('live visualization application', () => {
  it('distinguishes the working plots from upcoming inspection and exports', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Voice Lab' })).toBeInTheDocument();
    expect(screen.getByText(/exports are still in development/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
    expect(screen.getByText(/Microphone inactive/)).toBeInTheDocument();
  });

  it('exposes plot controls and the required second-phase tracking', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Spectrogram' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waveform' })).toBeInTheDocument();
    expect(screen.getByLabelText('Visible history')).toHaveValue('10');
    expect(screen.getByLabelText('Show RMS amplitude')).not.toBeChecked();
    expect(screen.getByText('Required · Phase 2')).toBeInTheDocument();
    expect(screen.getByText(/F0 frequency.*F1–F3/)).toBeInTheDocument();
  });
});
