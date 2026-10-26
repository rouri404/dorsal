import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { clockRate, effectFor, LIGHT_POINTS, lightAt, motionPeriod, zigzag, type LightPoint } from "../src/app/lightFx";
import { BOARD_ROWS, BOARD_UNITS, X85_KEYS } from "../src/layout/x85";
import type { LightSetting } from "../src/protocol/x85";

const setting = (mode: number, option: number): LightSetting => ({ mode, speed: 2, brightness: 4, option, rainbow: false, rgb: { r: 255, g: 0, b: 0 } });
const out = new THREE.Color();
const amount = (l: LightSetting, p: LightPoint, t: number) => lightAt(l, effectFor(l.mode)!, p, t, out);
const hue = (l: LightSetting, p: LightPoint, t: number) => {
  lightAt(l, effectFor(l.mode)!, p, t, out);
  return out.getHSL({ h: 0, s: 0, l: 0 }).h;
};
const point = (u: number, v: number): LightPoint => ({ u, v, row: Math.min(5, Math.floor(v * 6)), s: 0, seed: 0 });

/**
 * Which way a pattern travels along `x`: for f(x - ct), df/dt = -c df/dx, so the sign of
 * -(df/dt)(df/dx), summed over the samples, is the sign of c.
 */
function travel(signal: (x: number, t: number) => number): number {
  const dt = 0.01;
  const dx = 0.01;
  let sum = 0;
  for (let i = 1; i < 40; i++) {
    const x = i / 40;
    for (const t of [0.3, 0.9, 1.7]) {
      const ft = signal(x, t + dt) - signal(x, t);
      const fx = signal(x + dx, t) - signal(x, t);
      // A wrap of a periodic value (hue) is not motion.
      if (Math.abs(ft) > 0.2 || Math.abs(fx) > 0.2) continue;
      sum += -ft * fx;
    }
  }
  return Math.sign(sum);
}

describe("effect options in the preview", () => {
  it("moves the wave in the chosen direction", () => {
    const along = (option: number) => travel((x, t) => amount(setting(4, option), option < 2 ? point(x, 0.5) : point(0.5, x), t));
    expect([0, 1, 2, 3].map(along)).toEqual([1, -1, 1, -1]);
  });

  it("moves the lines right or left", () => {
    const along = (option: number) => travel((x, t) => amount(setting(12, option), point(x, 0.5), t));
    expect([0, 1].map(along)).toEqual([1, -1]);
  });

  it("turns the circular wave each way", () => {
    // Clockwise as seen from above: from +u (right) towards +v (the front).
    const around = (option: number) => travel((x, t) => amount(setting(15, option), point(0.5 + 0.3 * Math.cos(x * 6), 0.5 + 0.3 * Math.sin(x * 6)), t));
    expect([0, 1].map(around)).toEqual([-1, 1]);
  });

  it("sends the kaleidoscope outward or inward", () => {
    const along = (option: number) => travel((x, t) => amount(setting(11, option), point(0.5 + x * 0.45, 0.5), t));
    expect([0, 1].map(along)).toEqual([1, -1]);
  });

  it("orders the snake as a zigzag or a spiral", () => {
    // The spiral ignores the zigzag order `s`, so the same key lights at a different time.
    const times = (option: number) => Array.from({ length: 200 }, (_, i) => (lightAt(setting(7, option), "snake", { ...point(0.02, 0.05), s: 0.5 }, i * 0.1, out) > 0.5 ? 1 : 0)).join("");
    expect(times(0)).not.toEqual(times(1));
  });
});

/** Light at a point on the board given in key units (x across 0..16.5, y down 0..6). */
const at = (l: LightSetting, x: number, y: number, t: number) => amount(l, point(x / 16.5, y / 6), t);

// Timings measured from a video of the real keyboard running every effect at speed 2 (docs/protocol.md).
describe("effect timing, as filmed on the keyboard", () => {
  it("breathes from dark to full and back in 1.2 s", () => {
    const b = setting(2, 0);
    expect(at(b, 8, 3, 0)).toBeCloseTo(0, 2);
    expect(at(b, 8, 3, 0.6)).toBeCloseTo(1, 2);
    expect(at(b, 8, 3, 1.2)).toBeCloseTo(0, 2);
  });

  it("turns the neon hue round in about 2.6 s", () => {
    const n = setting(3, 0);
    const h0 = hue(n, point(0.5, 0.5), 0);
    expect(hue(n, point(0.5, 0.5), 0.65)).toBeCloseTo((h0 + 0.25) % 1, 1);
  });

  it("dips the wave, the lines and the circle about three times a second", () => {
    for (const mode of [4, 12, 15]) {
      const l = setting(mode, 0);
      const samples = Array.from({ length: 60 }, (_, i) => at(l, 6, 3, i / 60));
      // Lit most of the time, with a deep dip once per period.
      expect(Math.max(...samples)).toBeGreaterThan(0.95);
      expect(Math.min(...samples)).toBeLessThan(0.3);
      for (const t of [0.1, 0.5, 1.3]) expect(at(l, 6, 3, t + 0.34)).toBeCloseTo(at(l, 6, 3, t), 1);
    }
  });

  it("moves the rainbow wave's colours across the board in about 1.5 s", () => {
    // Seen on the keyboard on 2026-10-25, at speed 2: much slower than the dip of one colour.
    for (const mode of [4, 12]) {
      const l = { ...setting(mode, 0), rainbow: true };
      const d = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
      for (const v of [0.2, 0.5, 0.8]) {
        expect(d(hue(l, point(1, v), 1.5), hue(l, point(0, v), 0))).toBeLessThan(0.02);
        expect(d(hue(l, point(1, v), 0.4), hue(l, point(0, v), 0))).toBeGreaterThan(0.1);
      }
    }
  });

  it("runs faster at a higher speed", () => {
    const period = (speed: number) => {
      const l = { ...setting(2, 0), speed };
      // First time after the start that breathing is back to dark.
      for (let t = 0.05; t < 10; t += 0.005) if (at(l, 8, 3, t) < 0.001) return t;
      return Infinity;
    };
    expect(period(2)).toBeCloseTo(1.2, 1);
    expect(period(4)).toBeLessThan(period(2));
    expect(period(0)).toBeGreaterThan(period(2));
  });

  it("drives the train in from the left, then back in from the right", () => {
    const tr = setting(23, 0);
    expect(at(tr, 1, 3, 0.3)).toBeGreaterThan(0.9);
    expect(at(tr, 15, 3, 0.3)).toBe(0);
    expect(at(tr, 15, 3, 2.1 + 0.3)).toBeGreaterThan(0.9);
    expect(at(tr, 1, 3, 2.1 + 0.3)).toBe(0);
    // Dark between the two passes.
    expect(at(tr, 8, 3, 1.9)).toBe(0);
  });

  it("sends a meteor along one row at a time, left to right", () => {
    const m = setting(18, 0);
    const lit = (t: number) => [0, 1, 2, 3, 4, 5].filter((row) => at(m, 16, row + 0.5, t) > 0.5).length;
    // Never the whole board at once, and each streak reaches the right end after the left.
    for (let t = 0; t < 6; t += 0.25) expect(lit(t)).toBeLessThan(4);
    expect(travel((x, t) => amount(m, point(x, 0.5 / 6), t))).toBe(1);
  });

  it("keeps the chosen colour on kaleidoscope and rainbow unless rainbow is on", () => {
    for (const mode of [11, 16]) {
      lightAt(setting(mode, 0), effectFor(mode)!, point(0.3, 0.4), 0.7, out);
      expect(out.getHexString()).toBe("ff0000");
      lightAt({ ...setting(mode, 0), rainbow: true }, effectFor(mode)!, point(0.3, 0.4), 0.7, out);
      expect(out.getHexString()).not.toBe("ff0000");
    }
  });
});

describe("snake path", () => {
  it("runs the number row left to right and the row below it back", () => {
    const keys = [2, 1].flatMap((row) => [0.9, 0.1, 0.5].map((u) => ({ row, u })));
    expect(zigzag(keys).map((k) => `${k.row}:${k.u}`)).toEqual(["1:0.1", "1:0.5", "1:0.9", "2:0.9", "2:0.5", "2:0.1"]);
  });
});

describe("light points and periods, shared with the studio", () => {
  it("one light point per key, as the board builds them", () => {
    expect(LIGHT_POINTS.size).toBe(X85_KEYS.length);
    const k = X85_KEYS[0];
    expect(LIGHT_POINTS.get(k.pos)).toMatchObject({ u: (k.x + k.w / 2) / BOARD_UNITS, v: (k.y + 0.5) / BOARD_ROWS, seed: k.pos + 1, row: k.y });
    const s = [...LIGHT_POINTS.values()].map((p) => p.s);
    expect(new Set(s).size).toBe(s.length);
    for (const x of s) expect(x >= 0 && x < 1).toBe(true);
  });

  it("periodic effects repeat after their period", () => {
    const options: Record<number, number> = { 4: 4, 7: 2, 11: 2, 12: 2, 15: 2 };
    for (const mode of [2, 3, 4, 7, 10, 11, 12, 15, 16, 17, 23])
      for (let option = 0; option < (options[mode] ?? 1); option++)
        for (const rainbow of [false, true])
          for (const speed of [0, 2, 4]) {
            const l: LightSetting = { ...setting(mode, option), speed, rainbow };
            const P = motionPeriod(effectFor(mode)!, option, rainbow)!;
            expect(Number.isFinite(P)).toBe(true);
            const t = 0.37;
            const t2 = t + P / clockRate(speed);
            const a = new THREE.Color();
            const b = new THREE.Color();
            for (const p of LIGHT_POINTS.values()) {
              const label = `mode ${mode} option ${option} rainbow ${rainbow} speed ${speed}`;
              expect(lightAt(l, effectFor(mode)!, p, t2, b), label).toBeCloseTo(lightAt(l, effectFor(mode)!, p, t, a), 6);
              const [x, y] = [a.getHex(), b.getHex()];
              for (const sh of [16, 8, 0]) expect(Math.abs(((x >> sh) & 255) - ((y >> sh) & 255)), label).toBeLessThanOrEqual(1);
            }
          }
  });

  it("random effects have no period", () => {
    for (const mode of [5, 6, 8, 9, 14, 18, 19, 24]) expect(motionPeriod(effectFor(mode)!, 0, false)).toBeNull();
    expect(motionPeriod("static", 0, false)).toBe(Infinity);
  });

  it("speed 0 still moves", () => {
    expect(clockRate(0)).toBeGreaterThan(0.3);
  });
});
