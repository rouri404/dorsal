import { describe, expect, it } from "vitest";
import { BANDS, bandBins, bandLevels, createMeter, toHeights } from "../src/music/bands";

const RATE = 48000;
const FFT = 4096;
const binHz = RATE / FFT;

describe("bands", () => {
  it("splits 40 Hz to 16 kHz into 42 bands, low to high, each with its own bins", () => {
    const bins = bandBins(RATE, FFT);
    expect(bins).toHaveLength(BANDS);
    bins.forEach(([start, end], i) => {
      expect(end).toBeGreaterThan(start);
      if (i > 0) expect(start).toBeGreaterThanOrEqual(bins[i - 1][1]);
    });
    expect(bins[0][0] * binHz).toBeLessThan(60);
    expect(bins[BANDS - 1][1] * binHz).toBeGreaterThan(15000);
    expect(bins[BANDS - 1][1]).toBeLessThanOrEqual(FFT / 2);
  });

  it("lights the band of a tone, and nothing in silence", () => {
    const bins = bandBins(RATE, FFT);
    const silence = new Float32Array(FFT / 2).fill(-Infinity);
    expect(bandLevels(silence, bins)).toEqual(Array(BANDS).fill(0));
    const tone = new Float32Array(FFT / 2).fill(-120);
    const at = Math.round(1000 / binHz);
    tone[at] = -20;
    const levels = bandLevels(tone, bins);
    const loudest = levels.indexOf(Math.max(...levels));
    expect(bins[loudest][0]).toBeLessThanOrEqual(at);
    expect(bins[loudest][1]).toBeGreaterThan(at);
    expect(levels[loudest]).toBeGreaterThan(0.5);
  });
});

describe("meter", () => {
  const all = (x: number) => Array(BANDS).fill(x);

  it("rises fast and falls slowly", () => {
    const meter = createMeter();
    for (let i = 0; i < 50; i++) meter(all(0.8), 0.02);
    const up = createMeter();
    expect(up(all(0.8), 0.02)[0]).toBeGreaterThan(0.5);
    expect(meter(all(0), 0.02)[0]).toBeGreaterThan(0.85);
    let level = 1;
    for (let i = 0; i < 50; i++) level = meter(all(0), 0.02)[0];
    expect(level).toBe(0);
  });

  it("brings quiet music up to full height, and leaves silence dark", () => {
    const meter = createMeter();
    let out: number[] = [];
    for (let i = 0; i < 200; i++) out = meter(all(0.45), 0.02);
    expect(out[0]).toBeGreaterThan(0.9);
    const quiet = createMeter();
    for (let i = 0; i < 200; i++) out = quiet(all(0), 0.02);
    expect(out).toEqual(all(0));
  });

  it("does not blow faint noise up to full height", () => {
    const meter = createMeter();
    let out: number[] = [];
    for (let i = 0; i < 200; i++) out = meter(all(0.1), 0.02);
    expect(out[0]).toBeLessThan(0.4);
  });
});

describe("heights", () => {
  it("rounds levels to the keyboard's 0..6", () => {
    expect(toHeights([0, 0.08, 0.09, 0.5, 1, 1.5, -1])).toEqual([0, 0, 1, 3, 6, 6, 0]);
  });
});
