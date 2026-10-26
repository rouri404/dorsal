// From the sound's spectrum to the 42 bar heights the keyboard draws in its music modes. Pure, so
// the analysis can be tested without Web Audio.

/** Bands the keyboard takes, low to high (the vendor's driver sends 42). */
export const BANDS = 42;
/** The tallest bar: the keyboard's six rows. */
export const MAX_HEIGHT = 6;

/**
 * The FFT bins `[start, end)` of each band, log-spaced from `low` to `high` Hz. The lowest bands
 * are narrower than a bin, so each takes at least one bin of its own and the rest move up.
 */
export function bandBins(sampleRate: number, fftSize: number, count = BANDS, low = 40, high = 16000): [number, number][] {
  const binHz = sampleRate / fftSize;
  const last = fftSize / 2;
  const edge = (i: number) => (low * Math.pow(high / low, i / count)) / binHz;
  const out: [number, number][] = [];
  let next = Math.max(1, Math.round(edge(0)));
  for (let i = 0; i < count; i++) {
    const start = Math.min(next, last - (count - i));
    const end = Math.min(last - (count - i - 1), Math.max(start + 1, Math.round(edge(i + 1))));
    out.push([start, end]);
    next = end;
  }
  return out;
}

/**
 * Each band's level, 0..1: its mean power in dB, tilted up `tiltDb` per octave above 1 kHz (music
 * has less energy up high), placed between `floorDb` and `floorDb + rangeDb`.
 */
export function bandLevels(db: Float32Array, bins: [number, number][], sampleRate = 48000, fftSize = 4096, tiltDb = 4.5, floorDb = -80, rangeDb = 60): number[] {
  const binHz = sampleRate / fftSize;
  return bins.map(([start, end]) => {
    let power = 0;
    for (let i = start; i < end; i++) power += Math.pow(10, db[i] / 10);
    const level = 10 * Math.log10(power / (end - start));
    const centre = Math.sqrt(start * end) * binHz;
    const tilted = level + tiltDb * Math.log2(centre / 1000);
    return Math.min(1, Math.max(0, (tilted - floorDb) / rangeDb));
  });
}

/** Share of the gap to a louder level closed in one frame: bars jump up. */
const RISE = 0.7;
/** How far a bar drops in a second when the sound stops: it falls slowly. */
const FALL = 2.5;
/** The gain follows the loudest band, halving its memory of a peak every few seconds. */
const PEAK_HALF_LIFE = 4;
/** No more gain than this: faint noise must not fill the bars. */
const MIN_PEAK = 0.35;

/**
 * A meter over frames of band levels: fast rise, slow fall, and a gain that brings the loudest
 * recent band to the top, so quiet music still moves the bars. `dt` is in seconds.
 */
export function createMeter(count = BANDS): (raw: number[], dt: number) => number[] {
  let peak = 0;
  const shown = new Array<number>(count).fill(0);
  return (raw, dt) => {
    peak = Math.max(...raw, peak * Math.pow(0.5, dt / PEAK_HALF_LIFE));
    const gain = 1 / Math.max(peak, MIN_PEAK);
    for (let i = 0; i < count; i++) {
      const target = Math.min(1, (raw[i] ?? 0) * gain);
      shown[i] = target > shown[i] ? shown[i] + (target - shown[i]) * RISE : Math.max(target, shown[i] - FALL * dt);
    }
    return [...shown];
  };
}

/** Levels 0..1 as the keyboard's heights 0..6, as the vendor's driver rounds them. */
export const toHeights = (levels: number[]): number[] => levels.map((l) => Math.round(Math.min(1, Math.max(0, l)) * MAX_HEIGHT));
