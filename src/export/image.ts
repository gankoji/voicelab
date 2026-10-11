const PANEL_GAP = 12;

/** Composites the two live panels into one raster PNG (white background between them). */
export function encodePlotPng(spectrogram: HTMLCanvasElement, waveform: HTMLCanvasElement): Promise<Blob> {
  const width = Math.max(spectrogram.width, waveform.width);
  const height = spectrogram.height + PANEL_GAP + waveform.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas 2D is unavailable'));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(spectrogram, 0, 0);
  context.drawImage(waveform, 0, spectrogram.height + PANEL_GAP);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}
