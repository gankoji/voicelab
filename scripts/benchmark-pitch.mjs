import { createServer } from 'vite';

// Compares YIN and McLeod pitch estimation on reproducible synthetic fixtures.
// This is not evidence for real singing; audio-quality validation stays manual.
const sampleRate = 48000;
const windowSize = 2048;

function sine(f0, amplitude = 0.5) {
  return Float32Array.from({ length: windowSize }, (_, n) => amplitude * Math.sin(2 * Math.PI * f0 * n / sampleRate));
}

function harmonics(f0, amplitudes) {
  return Float32Array.from({ length: windowSize }, (_, n) => {
    let value = 0;
    amplitudes.forEach((amplitude, index) => {
      value += amplitude * Math.sin(2 * Math.PI * f0 * (index + 1) * n / sampleRate);
    });
    return value;
  });
}

function vibrato() {
  const out = new Float32Array(windowSize);
  let phase = 0;
  for (let n = 0; n < windowSize; n++) {
    const f0 = 440 + 20 * Math.sin(2 * Math.PI * 6 * n / sampleRate);
    phase += 2 * Math.PI * f0 / sampleRate;
    out[n] = 0.5 * Math.sin(phase);
  }
  return out;
}

function slide() {
  const out = new Float32Array(windowSize);
  let phase = 0;
  for (let n = 0; n < windowSize; n++) {
    const f0 = 200 + 200 * n / windowSize;
    phase += 2 * Math.PI * f0 / sampleRate;
    out[n] = 0.5 * Math.sin(phase);
  }
  return out;
}

function noisyTone(snrAmplitude = 0.1) {
  const out = sine(440);
  let seed = 0x9e3779b9;
  const random = () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  for (let n = 0; n < windowSize; n++) out[n] += (random() * 2 - 1) * snrAmplitude;
  return out;
}

const fixtures = [
  { name: '80 Hz tone', signal: sine(80), true: 80 },
  { name: '100 Hz tone', signal: sine(100), true: 100 },
  { name: '200 Hz tone', signal: sine(200), true: 200 },
  { name: '440 Hz tone', signal: sine(440), true: 440 },
  { name: '1000 Hz tone', signal: sine(1000), true: 1000 },
  { name: 'missing fundamental (100)', signal: harmonics(100, [0.25, 0.2, 0.18, 0.15]), true: 100 },
  { name: 'vibrato (440 ± 20)', signal: vibrato(), true: 440, variable: true },
  { name: 'slide (200 → 400)', signal: slide(), true: 300, variable: true },
  { name: 'noisy 440 Hz tone', signal: noisyTone(), true: 440 },
];

const cents = (f0, truth) => 1200 * Math.log2(f0 / truth);

const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
try {
  const { estimatePitchYin } = await server.ssrLoadModule('/src/analysis/pitch.ts');
  const { estimatePitchMcLeod } = await server.ssrLoadModule('/src/analysis/mcleod.ts');

  for (const fixture of fixtures) {
    const yin = estimatePitchYin(fixture.signal, { sampleRate });
    const mcleod = estimatePitchMcLeod(fixture.signal, { sampleRate });
    const yinErr = yin && !fixture.variable ? cents(yin.f0Hz, fixture.true) : null;
    const mcleodErr = mcleod && !fixture.variable ? cents(mcleod.f0Hz, fixture.true) : null;
    console.log([
      fixture.name.padEnd(24),
      `YIN ${yin ? `${yin.f0Hz.toFixed(1)} Hz${yinErr !== null ? ` (${yinErr.toFixed(1)}¢)` : ''}` : 'unvoiced'}`.padEnd(28),
      `MPM ${mcleod ? `${mcleod.f0Hz.toFixed(1)} Hz${mcleodErr !== null ? ` (${mcleodErr.toFixed(1)}¢)` : ''}` : 'unvoiced'}`,
    ].join(''));
  }
} finally {
  await server.close();
}
