import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('graph-first application', () => {
  it('starts with record controls and plots, without a settings form or development banner', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Voice Lab' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
    expect(screen.getByRole('status', { name: 'Capture status' })).toHaveTextContent('Ready');
    expect(screen.getByLabelText('Audio input')).not.toBeVisible();
    expect(screen.getByLabelText('Visible history')).not.toBeVisible();
    expect(screen.getByText('Audio stays on this device. Nothing is saved.')).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Development status' })).not.toBeInTheDocument();
  });

  it('reveals controls on demand and restores focus when dismissed', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Spectrogram' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waveform' })).toBeInTheDocument();
    const settings = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(settings);
    expect(screen.getByRole('button', { name: 'Close settings' })).toHaveFocus();
    expect(screen.getByLabelText('Visible history')).toBeVisible();
    expect(screen.getByLabelText('Visible history')).toHaveValue('10');
    expect(screen.getByLabelText('Show RMS amplitude')).not.toBeChecked();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('Visible history')).not.toBeVisible();
    expect(settings).toHaveFocus();
  });
});
