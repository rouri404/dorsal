// Effects built in the studio: a stack of layers (waves, solid colours, painted keys and the
// keyboard's own effects), each over an area of keys. colourAt gives a key's colour at a time; the 3D preview and the frames uploaded to the
// keyboard both draw from it, so what is shown is what gets stored.

import { BOARD_ROWS, BOARD_UNITS, X85_KEYS } from "../layout/x85";
import { FACTORY_BASE } from "../layout/x85-factory";
import * as THREE from "three";
import { EFFECTS, effectOf } from "../protocol/effects";
import type { LightSetting, Rgb } from "../protocol/x85";
import { clockRate, effectFor, LIGHT_POINTS, lightAt, motionPeriod } from "../app/lightFx";

export type LayerKind = "linear" | "radial" | "solid" | "paint" | "effect";

/** The keyboard's effects a layer can run: every animated one that needs no host stream. */
export const LAYER_EFFECTS = EFFECTS.map((e) => e.id).filter((id) => (id >= 2 && id <= 12) || (id >= 14 && id <= 19) || id === 23 || id === 24);
/** Those that never repeat: random keys, or presses the studio simulates. */
export const RANDOM_EFFECTS = [5, 6, 8, 9, 14, 18, 19, 24];

export interface Layer {
  id: string;
  kind: LayerKind;
  visible: boolean;
  /** Matrix slots the layer covers, or "all". */
  area: number[] | "all";
  /** 1..8, evenly spaced along the wave and cyclic; a solid layer uses the first. */
  colours: Rgb[];
  /** Keys per gradient cycle, 2..40. */
  width: number;
  /** 0 hard bands .. 1 fully blended. */
  softness: number;
  /** 0 (still) .. 10. */
  speed: number;
  /** Linear: degrees, 0 = towards the right, 90 = towards the front. */
  angle: number;
  /** Radial: matrix slot of the centre key. */
  centre: number;
  inward: boolean;
  /** For kind "effect": which of the keyboard's effects, as on the keyboard; colours[0] is its colour. */
  effect?: { mode: number; option: number; speed: number; rainbow: boolean };
  /** 0..1, how bright the layer's colours are (dimmer, not more see-through); missing in older effects, read as 1. */
  brightness?: number;
  /** For kind "paint": a colour per matrix slot, or null where unpainted (the layers below show). */
  keys?: (Rgb | null)[];
}

/** How a layer runs inside a loop: its period after fitting (Infinity when still or random) and the loop. */
export interface LayerTiming {
  period: number;
  loopS: number;
}

export interface StudioEffect {
  id: string;
  name: string;
  /** The top layer first. */
  layers: Layer[];
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const RAINBOW: Rgb[] = ["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff"].map((h) => ({
  r: parseInt(h.slice(1, 3), 16),
  g: parseInt(h.slice(3, 5), 16),
  b: parseInt(h.slice(5, 7), 16),
}));

const POINTS = new Map(X85_KEYS.map((k) => [k.pos, { x: k.x + k.w / 2, y: k.y + 0.5 + (k.dy ?? 0) }]));

/** Where a key sits, in key units, or nothing for a slot with no physical key. */
export const keyPoint = (slot: number) => POINTS.get(slot);

const MIDDLE = { x: BOARD_UNITS / 2, y: BOARD_ROWS / 2 };
const CENTRE_KEY = [...POINTS].reduce((best, [pos, p]) =>
  Math.hypot(p.x - MIDDLE.x, p.y - MIDDLE.y) < Math.hypot(best[1].x - MIDDLE.x, best[1].y - MIDDLE.y) ? [pos, p] : best,
)[0];

const newId = () => Math.random().toString(36).slice(2, 10);

export function newLayer(kind: LayerKind): Layer {
  return {
    id: newId(),
    kind,
    visible: true,
    area: "all",
    colours: kind === "solid" || kind === "effect" ? [{ r: 255, g: 255, b: 255 }] : RAINBOW.map((c) => ({ ...c })),
    width: 16,
    softness: 1,
    speed: 3,
    angle: 0,
    centre: CENTRE_KEY,
    inward: false,
    brightness: 1,
    ...(kind === "effect" && { effect: { mode: 2, option: 0, speed: 2, rainbow: false } }),
    ...(kind === "paint" && { keys: new Array<Rgb | null>(128).fill(null) }),
  };
}

export const newEffect = (name = "Efeito"): StudioEffect => ({ id: newId(), name, layers: [newLayer("linear")] });

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const frac = (x: number) => x - Math.floor(x);

/** How far to blend towards the next colour: a ramp centred on the midpoint, as wide as the softness. */
export const ease = (f: number, softness: number) => (softness <= 0 ? (f < 0.5 ? 0 : 1) : clamp01((f - 0.5) / softness + 0.5));

export function sampleGradient(colours: Rgb[], phase: number, softness: number): Rgb {
  const n = colours.length;
  if (n === 0) return BLACK;
  const at = frac(phase) * n;
  const i = Math.floor(at) % n;
  const a = colours[i];
  const b = colours[(i + 1) % n];
  const k = ease(at - Math.floor(at), softness);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) };
}

/** Seconds a wave takes for one cycle at a speed (0 is still). */
export const periodOf = (speed: number) => (speed > 0 ? 12 / speed : Infinity);

const covers = (area: Layer["area"], slot: number) => area === "all" || area.includes(slot);

function waveColour(layer: Layer, slot: number, t: number, period: number): Rgb | undefined {
  const p = keyPoint(slot);
  if (!p) return undefined;
  if (layer.kind === "solid") return layer.colours[0] ?? BLACK;
  let phase: number;
  if (layer.kind === "linear") {
    const a = (layer.angle * Math.PI) / 180;
    phase = (p.x * Math.cos(a) + p.y * Math.sin(a)) / layer.width;
  } else {
    const c = keyPoint(layer.centre) ?? keyPoint(CENTRE_KEY)!;
    const d = Math.hypot(p.x - c.x, p.y - c.y) / layer.width;
    phase = layer.inward ? -d : d;
  }
  return sampleGradient(layer.colours, phase - (Number.isFinite(period) ? t / period : 0), layer.softness);
}

/** The light setting an effect layer runs, at full brightness, with an option the effect has. */
function effectSetting(layer: Layer): LightSetting {
  const { mode, option, speed, rainbow } = layer.effect!;
  const fx = effectOf(mode);
  return {
    mode,
    speed,
    brightness: 4,
    option: option < (fx?.options?.length ?? 1) ? option : 0,
    rainbow: rainbow || fx?.colour === false,
    rgb: layer.colours[0] ?? { r: 255, g: 255, b: 255 },
  };
}

/** Seconds an effect layer takes to repeat at its speed; null when it never does, or for other layers. */
export function effectSeconds(layer: Layer): number | null {
  if (layer.kind !== "effect" || !layer.effect) return null;
  const l = effectSetting(layer);
  const p = motionPeriod(effectFor(l.mode)!, l.option, l.rainbow);
  return p === null ? null : p / clockRate(l.speed);
}

const tmp = new THREE.Color();
function effectLight(l: LightSetting, slot: number, t: number): { c: Rgb; a: number } | undefined {
  const p = LIGHT_POINTS.get(slot);
  if (!p) return undefined;
  const a = lightAt(l, effectFor(l.mode)!, p, t, tmp);
  const hex = tmp.getHex();
  return { c: { r: hex >> 16, g: (hex >> 8) & 255, b: hex & 255 }, a };
}

/**
 * A layer's colour at a key, dimmed by its brightness, and how much of it shows over the layers
 * below (1 for waves, solid colours and painted keys, the effect's light for an effect layer), or
 * nothing where the layer does not draw.
 */
export function layerLight(layer: Layer, slot: number, t: number, timing: LayerTiming): { c: Rgb; a: number } | undefined {
  const l = undimmed(layer, slot, t, timing);
  const b = layer.brightness ?? 1;
  return !l || b >= 1 ? l : { c: { r: Math.round(l.c.r * b), g: Math.round(l.c.g * b), b: Math.round(l.c.b * b) }, a: l.a };
}

function undimmed(layer: Layer, slot: number, t: number, timing: LayerTiming): { c: Rgb; a: number } | undefined {
  if (!layer.visible || !covers(layer.area, slot)) return undefined;
  if (layer.kind === "paint") {
    const c = layer.keys?.[slot];
    return c ? { c, a: 1 } : undefined;
  }
  if (layer.kind !== "effect") {
    const c = waveColour(layer, slot, t, timing.period);
    return c && { c, a: 1 };
  }
  if (!layer.effect) return undefined;
  const l = effectSetting(layer);
  const natural = effectSeconds(layer);
  if (natural !== null) return effectLight(l, slot, Number.isFinite(timing.period) ? (t * natural) / timing.period : t);
  // A random effect never repeats: over the end of the loop it fades into how the loop starts.
  const now = effectLight(l, slot, t);
  const fade = Math.min(0.5, timing.loopS / 4);
  const w = Number.isFinite(timing.loopS) ? clamp01((t - (timing.loopS - fade)) / fade) : 0;
  if (!now || w === 0) return now;
  const start = effectLight(l, slot, t - timing.loopS)!;
  const a = now.a + (start.a - now.a) * w;
  // Mixed with the light each one gives, so the colour of a dark key does not leak in.
  const mix = (x: number, y: number) => (a > 0 ? Math.round((x * now.a + (y * start.a - x * now.a) * w) / a) : x);
  return { c: { r: mix(now.c.r, start.c.r), g: mix(now.c.g, start.c.g), b: mix(now.c.b, start.c.b) }, a };
}

/** A key's colour: the layers from the bottom up, each over what lies below it, from black. */
export function colourAt(effect: StudioEffect, slot: number, t: number, timings: LayerTiming[]): Rgb {
  let out = BLACK;
  for (let i = effect.layers.length - 1; i >= 0; i--) {
    const l = layerLight(effect.layers[i], slot, t, timings[i] ?? { period: Infinity, loopS: Infinity });
    if (!l) continue;
    const mix = (x: number, y: number) => Math.round(x + (y - x) * l.a);
    out = l.a >= 1 ? l.c : { r: mix(out.r, l.c.r), g: mix(out.g, l.c.g), b: mix(out.b, l.c.b) };
  }
  return out;
}

const ALL_KEYS = X85_KEYS.map((k) => k.pos);
const byUsage = (from: number, to: number) => ALL_KEYS.filter((pos) => FACTORY_BASE[pos][0] === 0 && FACTORY_BASE[pos][2] >= from && FACTORY_BASE[pos][2] <= to);

export const AREA_SETS: { id: "all" | "letters" | "numbers" | "frow" | "arrows" | "none"; pt: string; en: string; slots: number[] | "all" }[] = [
  { id: "all", pt: "Todas", en: "All", slots: "all" },
  { id: "letters", pt: "Letras", en: "Letters", slots: byUsage(0x04, 0x1d) },
  { id: "numbers", pt: "Números", en: "Numbers", slots: byUsage(0x1e, 0x27) },
  { id: "frow", pt: "F1–F12", en: "F1–F12", slots: byUsage(0x3a, 0x45) },
  { id: "arrows", pt: "Setas", en: "Arrows", slots: byUsage(0x4f, 0x52) },
  { id: "none", pt: "Nenhuma", en: "None", slots: [] },
];

export function toggleArea(area: Layer["area"], slot: number, add: boolean): number[] {
  const list = area === "all" ? ALL_KEYS : area;
  if (add) return list.includes(slot) ? list : [...list, slot];
  return list.filter((s) => s !== slot);
}

/**
 * A stroke of the area brush on a key. Painting over a layer that covers every key starts its area
 * afresh, with just that key, since adding to all keys would change nothing.
 */
export const paintArea = (area: Layer["area"], slot: number, add: boolean): number[] => (add && area === "all" ? [slot] : toggleArea(area, slot, add));
