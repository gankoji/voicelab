/** Monotonic-luminance dark-purple → teal → yellow palette, shared with the legend. */
const STOPS = [
  [28, 20, 53], [55, 67, 118], [37, 129, 142], [79, 190, 111], [253, 231, 37],
];

export const PALETTE = new Uint8ClampedArray(256 * 4);
PALETTE.set([10, 24, 32, 255]); // Missing data has its own color, distinct from measured silence.
for (let value = 1; value <= 255; value++) {
  const position = (value - 1) / 254 * (STOPS.length - 1);
  const index = Math.min(STOPS.length - 2, Math.floor(position));
  const blend = position - index;
  for (let channel = 0; channel < 3; channel++) {
    PALETTE[value * 4 + channel] = STOPS[index]![channel]! * (1 - blend) + STOPS[index + 1]![channel]! * blend;
  }
  PALETTE[value * 4 + 3] = 255;
}

export const LEGEND_GRADIENT = `linear-gradient(to right, ${STOPS.map((stop) => `rgb(${stop.join(' ')})`).join(', ')})`;
