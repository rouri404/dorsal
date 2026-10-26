// Saved studio effects and the one stored on the keyboard. The keyboard cannot read its animation
// back, so this local copy is what the preview of mode 25 shows. Storage that is missing, refused
// or holds junk reads as empty.

import type { Rgb } from "../protocol/x85";
import { LAYER_EFFECTS, type Layer, type StudioEffect } from "./effect";

const EFFECTS = "dorsal.studio.effects";
const ON_KEYBOARD = "dorsal.studio.onKeyboard";

const isByte = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255;
const isRgb = (c: unknown): c is Rgb => !!c && [(c as Rgb).r, (c as Rgb).g, (c as Rgb).b].every(isByte);
const inRange = (v: unknown, lo: number, hi: number) => typeof v === "number" && v >= lo && v <= hi;

/** An effect layer's settings; an option the effect lacks is drawn as its first, not refused. */
function isLayerEffect(e: Layer["effect"]): boolean {
  return (
    !!e &&
    LAYER_EFFECTS.includes(e.mode) &&
    isByte(e.option) &&
    Number.isInteger(e.speed) &&
    e.speed >= 0 &&
    e.speed <= 4 &&
    typeof e.rainbow === "boolean"
  );
}

function isLayer(v: unknown): v is Layer {
  const l = v as Layer;
  return (
    !!l &&
    typeof l.id === "string" &&
    ["linear", "radial", "solid", "paint", "effect"].includes(l.kind) &&
    (l.kind !== "effect" || isLayerEffect(l.effect)) &&
    (l.brightness === undefined || inRange(l.brightness, 0, 1)) &&
    (l.kind !== "paint" || (Array.isArray(l.keys) && l.keys.length === 128 && l.keys.every((c) => c === null || isRgb(c)))) &&
    typeof l.visible === "boolean" &&
    (l.area === "all" || (Array.isArray(l.area) && l.area.every((s) => Number.isInteger(s) && s >= 0 && s < 128))) &&
    Array.isArray(l.colours) &&
    l.colours.length >= 1 &&
    l.colours.length <= 8 &&
    l.colours.every(isRgb) &&
    inRange(l.width, 2, 40) &&
    inRange(l.softness, 0, 1) &&
    inRange(l.speed, 0, 10) &&
    inRange(l.angle, 0, 360) &&
    Number.isInteger(l.centre) &&
    typeof l.inward === "boolean"
  );
}

export function isEffect(v: unknown): v is StudioEffect {
  const e = v as StudioEffect;
  return !!e && typeof e.id === "string" && typeof e.name === "string" && Array.isArray(e.layers) && e.layers.every(isLayer);
}

function read(key: string): unknown {
  try {
    const text = globalThis.localStorage?.getItem(key);
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or refused: the effects stay for this session only.
  }
}

export function loadEffects(): StudioEffect[] {
  const list = read(EFFECTS);
  return Array.isArray(list) ? list.filter(isEffect) : [];
}

export const saveEffects = (list: StudioEffect[]) => write(EFFECTS, list);

export function loadOnKeyboard(): StudioEffect | null {
  const e = read(ON_KEYBOARD);
  return isEffect(e) ? e : null;
}

export const saveOnKeyboard = (e: StudioEffect) => write(ON_KEYBOARD, e);

export const upsertEffect = (list: StudioEffect[], e: StudioEffect) => (list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e]);

export const removeEffect = (list: StudioEffect[], id: string) => list.filter((x) => x.id !== id);

/** Adds the incoming effects that are missing; on a clash of ids the local copy stays. */
export const mergeEffects = (list: StudioEffect[], incoming: StudioEffect[]) => [...list, ...incoming.filter((e) => !list.some((x) => x.id === e.id))];
