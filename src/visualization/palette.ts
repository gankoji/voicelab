import type { PaletteName } from '../analysis/view';

export interface Palette {
  colors: Uint8ClampedArray;
  legendGradient: string;
}

const MISSING = [10, 24, 32, 255]; // Distinct from measured silence in every palette.

const STOPS: Record<PaletteName, number[][]> = {
  viridis: [
    [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
  ],
  magma: [
    [0, 0, 4], [63, 19, 91], [156, 50, 124], [233, 110, 62], [252, 253, 191],
  ],
  grayscale: [
    [0, 0, 0], [72, 72, 72], [140, 140, 140], [200, 200, 200], [255, 255, 255],
  ],
};

function buildPalette(stops: number[][]): Palette {
  const colors = new Uint8ClampedArray(256 * 4);
  colors.set(MISSING, 0);
  for (let value = 1; value <= 255; value++) {
    const position = (value - 1) / 254 * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(position));
    const blend = position - index;
    for (let channel = 0; channel < 3; channel++) {
      colors[value * 4 + channel] = stops[index]![channel]! * (1 - blend) + stops[index + 1]![channel]! * blend;
    }
    colors[value * 4 + 3] = 255;
  }
  return {
    colors,
    legendGradient: `linear-gradient(to right, ${stops.map((stop) => `rgb(${stop.join(' ')})`).join(', ')})`,
  };
}

export const PALETTES: Record<PaletteName, Palette> = {
  viridis: buildPalette(STOPS.viridis),
  magma: buildPalette(STOPS.magma),
  grayscale: buildPalette(STOPS.grayscale),
};
