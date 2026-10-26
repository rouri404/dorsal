// How each key light effect moves, for the 3D preview: lightAt gives a key's colour and amount
// of light at a time. Pure, so the motion of each option can be tested.

import * as THREE from "three";
import type { LightSetting } from "../protocol/x85";
import { BOARD_ROWS, BOARD_UNITS, X85_KEYS } from "../layout/x85";
import { BANDS, MAX_HEIGHT } from "../music/bands";
import { liveBars } from "../music/live";

export type Motion =
  | "static" | "breathe" | "neon" | "wave" | "ripple" | "raindrop" | "snake" | "reactive" | "converge" | "sine"
  | "kaleido" | "lines" | "laser" | "circle" | "rainbow" | "rain" | "meteor" | "reactiveOff" | "train" | "fireworks" | "music";
const MOTION_OF: Record<number, Motion> = {
  1: "static", 2: "breathe", 3: "neon", 4: "wave", 5: "ripple", 6: "raindrop", 7: "snake", 8: "reactive", 9: "converge",
  10: "sine", 11: "kaleido", 12: "lines", 14: "laser", 15: "circle", 16: "rainbow", 17: "rain", 18: "meteor",
  19: "reactiveOff", 20: "music", 22: "music", 23: "train", 24: "fireworks",
};
export const frac = (x: number) => x - Math.floor(x);
const hash = (n: number) => frac(Math.sin(n * 12.9898 + 78.233) * 43758.5453);

export interface LightPoint {
  u: number;
  v: number;
  row: number;
  s: number;
  seed: number;
}

/** Order of a key along a spiral from the board's edge to its centre, 0..1. */
function spiral(u: number, v: number): number {
  const ring = Math.floor(Math.min(u * 15, 15 - u * 15, v * 5, 5 - v * 5));
  return (ring + frac(Math.atan2(v - 0.5, u - 0.5) / (Math.PI * 2))) / 3;
}

/** The zigzag snake's path: the number row left to right, the next row back, and so on. */
export const zigzag = <K extends { row: number; u: number }>(keys: K[]): K[] =>
  [...keys].sort((a, b) => a.row - b.row || (a.row % 2 ? a.u - b.u : b.u - a.u));

/** Each key's light point, by matrix slot: where it sits, its row, its place on the snake's path. */
export const LIGHT_POINTS: Map<number, LightPoint> = (() => {
  const keys = X85_KEYS.map((k) => ({ pos: k.pos, u: (k.x + k.w / 2) / BOARD_UNITS, v: (k.y + 0.5) / BOARD_ROWS, seed: k.pos + 1, row: k.y, s: 0 }));
  const path = zigzag(keys);
  path.forEach((k, i) => (k.s = i / path.length));
  return new Map(keys.map(({ pos, ...p }) => [pos, p]));
})();

// The board in key units, so that motion measured in keys per second holds both across and down.
const W = 16.5;
const H = 6;
/** 0 at the crest of a raised cosine of the given period, sharpened by `pow`: a dip of light. */
const dip = (phase: number, pow: number) => Math.pow(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), pow);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Keys a second the rainbow wave's colours travel at speed 2 (across the board in about 1.5 s). */
const RAINBOW_SWEEP = W / 1.5;

/** A simulated key press for the effects that answer typing: which key, and how long ago. */
function press(t: number, every: number, salt: number): { x: number; y: number; row: number; age: number }[] {
  const n = Math.floor(t / every);
  return [n, n - 1, n - 2].map((i) => {
    const row = Math.floor(hash(i * 3.7 + salt) * H);
    return { x: hash(i * 5.3 + salt) * W, y: row + 0.5, row, age: t - i * every };
  });
}

/** A made-up bar for the preview when no sound is heard: a bass beat and a wandering melody. */
function demoBar(band: number, t: number): number {
  const beat = Math.pow(1 - frac(t * 2), 3) * Math.max(0, 1 - band / 12);
  const melody = 0.5 + 0.5 * Math.sin(t * 3.1 + band * 0.45) * Math.sin(t * 1.3 - band * 0.21);
  const fade = 1 - band / (BANDS * 1.6);
  return Math.round(Math.min(1, (0.25 * beat + 0.75 * melody) * fade + 0.4 * beat) * MAX_HEIGHT);
}

/** How fast an effect's own clock runs at a speed: speed 2 is the filmed one. */
export const clockRate = (speed: number) => (0.35 + speed * 0.4) / 1.15;

/**
 * How long an effect takes to repeat, in its own clock (seconds divided by clockRate): null when
 * it never repeats (random keys, simulated presses), Infinity when it does not move.
 */
export function motionPeriod(effect: Motion, option: number, rainbow: boolean): number | null {
  switch (effect) {
    case "static":
      return Infinity;
    case "breathe":
      return 1.2;
    case "neon":
      return 2.6;
    case "wave":
    case "lines":
      return rainbow ? 18 / RAINBOW_SWEEP : 0.34;
    case "kaleido":
    case "circle":
      return 0.34;
    case "sine":
      return rainbow ? 10 : 2;
    case "rainbow":
      return rainbow ? 1 / 0.12 : 2 / 2.3;
    case "snake":
      return option === 1 ? 1 / 0.18 : 1 / 0.12;
    case "train":
      return 4.2;
    case "rain":
      return 2;
    default:
      return null;
  }
}

// Timings below were measured from a video of the keyboard running each effect at speed 2.
export function lightAt(l: LightSetting, effect: Motion, p: LightPoint, t: number, out: THREE.Color): number {
  // Speed 2 is the filmed one; the others keep the vendor's roughly even steps.
  const T = t * clockRate(l.speed);
  const { u, v, row, s, seed } = p;
  const x = u * W;
  const y = v * H;
  let hue = u * 0.85;
  let amount = 1;
  let ownHue = false;
  switch (effect) {
    case "breathe":
      amount = 0.5 - 0.5 * Math.cos((T / 1.2) * Math.PI * 2);
      break;
    case "neon":
      hue = T / 2.6;
      ownHue = true;
      break;
    case "wave":
    case "lines": {
      // A dark dip sweeps the lit board three times a second; with the rainbow, the colours cross
      // the board in about 1.5 s instead. Wave: right, left, down, up; lines: right, left.
      const along = [x, W - x, y, H - y][l.option] ?? x;
      if (l.rainbow) hue = (along - T * RAINBOW_SWEEP) / 18;
      else amount = 1 - 0.85 * dip(along / 18 - T / 0.34, effect === "wave" ? 3 : 2);
      break;
    }
    case "ripple": {
      // A ring of light spreads from each key pressed (the preview presses some).
      amount = 0;
      for (const k of press(T, 0.9, 1)) {
        const front = k.age * 18 - Math.hypot(x - k.x, y - k.y);
        if (front > 0 && front < 4) amount = Math.max(amount, (1 - front / 4) * clamp01(1 - k.age / 1.2));
      }
      hue = T * 0.3;
      break;
    }
    case "raindrop":
    case "reactive":
    case "reactiveOff": {
      // Raindrop lights random keys, about a third of the board at a time; the others answer typing.
      const drop = effect === "raindrop";
      const clock = T * (drop ? 1.6 : 0.7) + hash(seed) * 20;
      const event = Math.floor(clock);
      const on = hash(seed * 7.1 + event) < (drop ? 0.6 : 0.07);
      const fade = on ? Math.pow(1 - frac(clock), drop ? 0.8 : 2.5) : 0;
      amount = effect === "reactiveOff" ? 1 - fade : fade;
      hue = hash(seed + event * 3.3);
      break;
    }
    case "snake": {
      // A lit run of about nine keys on a faint board. Options: zigzag along the rows, or a spiral
      // from the edge inwards, which runs faster.
      const spiralled = l.option === 1;
      const path = spiralled ? spiral(u, v) : s;
      const tail = spiralled ? 0.06 : 0.094;
      const behind = frac(T * (spiralled ? 0.18 : 0.12) - path);
      amount = behind < tail ? 1 - (behind / tail) * 0.9 : 0.06;
      hue = path * 3;
      break;
    }
    case "converge": {
      // Light spreads from a point until the board is lit, then darkness spreads from the same point.
      const cycle = T / 1.9;
      const n = Math.floor(cycle);
      const ph = frac(cycle);
      const r = Math.hypot(x - (0.2 + hash(n) * 0.6) * W, y - (0.2 + hash(n + 0.5) * 0.6) * H);
      amount = clamp01((ph * 95 - r) / 3) * (1 - clamp01(((ph - 0.4) * 50 - r) / 3));
      hue = hash(n + 2);
      break;
    }
    case "sine":
      // Almost steady, with a gentle swell along the board.
      amount = 0.85 + 0.15 * Math.sin((x / W) * Math.PI * 2.4 - T * Math.PI);
      hue = u - T * 0.1;
      break;
    case "kaleido": {
      // Rings dip from the centre outward, or close in. Options: outward, inward.
      const r = Math.hypot(x - W / 2, y - H / 2);
      const phase = r / 12 + (l.option === 1 ? 1 : -1) * (T / 0.34);
      hue = phase + Math.atan2(y - H / 2, x - W / 2) / (Math.PI * 2);
      if (!l.rainbow) amount = 1 - 0.9 * dip(phase, 3);
      break;
    }
    case "laser": {
      // A beam runs along the row of each key pressed, both ways.
      amount = 0;
      for (const k of press(T, 1.1, 2)) {
        const reach = k.age * 30 - Math.abs(x - k.x);
        if (row === k.row && reach > 0) amount = Math.max(amount, clamp01(1 - reach / 12) * clamp01(1 - k.age / 0.9));
      }
      hue = x / W;
      break;
    }
    case "circle": {
      // One dark sector turns about the centre three times a second. Options: anticlockwise,
      // clockwise, seen from above (clockwise runs from the right towards the front).
      const turn = Math.atan2(y - H / 2, x - W / 2) / (Math.PI * 2);
      const phase = turn - (l.option === 1 ? 1 : -1) * (T / 0.34);
      hue = phase;
      if (!l.rainbow) amount = 1 - 0.9 * dip(phase, 2);
      break;
    }
    case "rainbow":
      // With one colour it barely moves; the colours are the rainbow option's.
      hue = u + v * 0.3 - T * 0.12;
      if (!l.rainbow) amount = 0.75 + 0.1 * Math.sin((x / W) * Math.PI * 2 - T * Math.PI * 2.3);
      break;
    case "rain": {
      // Drops run down each column over a dim board.
      const col = Math.round(u * 16);
      const head = frac(T * 0.5 + hash(col) * 5) * 1.4;
      const dist = head - v;
      amount = 0.25 + (dist > 0 && dist < 0.4 ? 0.75 * (1 - dist / 0.4) : 0);
      hue = hash(col + 9);
      break;
    }
    case "meteor": {
      // A streak crosses one row at a time from left to right, stays lit a moment and fades.
      amount = 0;
      for (let n = Math.floor(T / 0.65), i = n; i > n - 3; i--) {
        if (Math.floor(hash(i * 1.9 + 4) * H) !== row) continue;
        const age = T - i * 0.65 - x / 60;
        if (age >= 0) amount = Math.max(amount, age < 0.7 ? 1 : clamp01(1 - (age - 0.7) / 0.4));
      }
      hue = u;
      break;
    }
    case "train": {
      // A long lit train crosses from the left, then comes back from the right.
      const leg = T / 2.1;
      const along = Math.floor(leg) % 2 ? W - x : x;
      const behind = frac(leg) * 2.1 * 25 - along;
      amount = behind < 0 || behind > 20 ? 0 : 1 - clamp01((behind - 12) / 8);
      hue = row / 6;
      break;
    }
    case "music": {
      // Not filmed: the keyboard draws the bars itself. Here each band is a column across the
      // board, its height lighting the rows from the bottom; with no sound, bars dance on their own.
      const band = Math.min(BANDS - 1, Math.floor(u * BANDS));
      const height = liveBars()?.[band] ?? demoBar(band, T);
      amount = H - row <= height ? 1 : 0;
      break;
    }
    case "fireworks": {
      // Rings burst over a lit board.
      const clock = T * 0.75;
      const burst = Math.floor(clock);
      const phase = frac(clock);
      const r = Math.hypot(x - (0.1 + hash(burst) * 0.8) * W, y - (0.1 + hash(burst + 3) * 0.8) * H);
      amount = 1 - 0.45 * clamp01(1 - Math.abs(r - phase * 9) / 1.5) * (1 - phase);
      hue = hash(burst + 5);
      break;
    }
  }
  // Full saturation: an LED shows a pure hue, not a pastel.
  if (l.rainbow || ownHue) out.setHSL(frac(hue), 1, 0.5);
  else out.setRGB(l.rgb.r / 255, l.rgb.g / 255, l.rgb.b / 255, THREE.SRGBColorSpace);
  return amount * (l.brightness / 4);
}

export const effectFor = (mode: number): Motion | undefined => (mode === 0 ? undefined : MOTION_OF[mode] ?? "static");
