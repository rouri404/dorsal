// Turns a studio effect into the looping frames the keyboard stores. The loop is as long as the
// slowest wave or effect (1 to 13 s, in up to 100 frames of 20 to 130 ms), and at least 8 s when an
// effect never repeats; every other one is set to a whole number of cycles in it, and the random
// ones fade into the start, so the last frame runs into the first with no jump.

import type { Rgb } from "../protocol/x85";
import { MAX_FRAMES } from "../protocol/effects";
import { colourAt, effectSeconds, periodOf, type Layer, type LayerTiming, type StudioEffect } from "./effect";

export interface LoopPlan {
  frames: number;
  delayMs: number;
  loopS: number;
  /** Each layer's period after closing the loop (Infinity when still or random), and the loop. */
  timings: LayerTiming[];
  /** A speed had to change by more than 5% for the loop to close. */
  adjusted: boolean;
}

const SLOTS = 128;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Long enough for an effect that never repeats not to look like it loops. */
const RANDOM_LOOP_S = 8;

/** Seconds a layer takes to repeat: Infinity when still or not shown, null when it never repeats. */
function wantedPeriod(l: Layer): number | null {
  if (!l.visible || (l.area !== "all" && l.area.length === 0)) return Infinity;
  if (l.kind === "effect") return effectSeconds(l);
  return l.kind === "solid" || l.kind === "paint" ? Infinity : periodOf(l.speed);
}

export function planLoop(effect: StudioEffect): LoopPlan {
  const wanted = effect.layers.map(wantedPeriod);
  if (wanted.every((p) => p === Infinity)) return { frames: 1, delayMs: 1000, loopS: 1, timings: effect.layers.map(() => ({ period: Infinity, loopS: 1 })), adjusted: false };
  const finite = wanted.filter((p): p is number => p !== null && Number.isFinite(p));
  const longest = clamp(Math.max(...finite, wanted.includes(null) ? RANDOM_LOOP_S : 0), 1, 13);
  const frames = Math.min(MAX_FRAMES, Math.floor(longest / 0.02));
  const delayMs = clamp(Math.round((longest * 1000) / frames), 20, 130);
  const loopS = (frames * delayMs) / 1000;
  let adjusted = false;
  const periods = wanted.map((p) => {
    if (p === null || !Number.isFinite(p)) return Infinity;
    const period = loopS / Math.max(1, Math.round(loopS / p));
    if (Math.abs(period - p) / p > 0.05) adjusted = true;
    return period;
  });
  return { frames, delayMs, loopS, timings: periods.map((period) => ({ period, loopS })), adjusted };
}

const coloursAt = (effect: StudioEffect, plan: LoopPlan, at: number): Rgb[] =>
  Array.from({ length: SLOTS }, (_, slot) => colourAt(effect, slot, at, plan.timings));

/**
 * Every key's colour at a time, by matrix slot (slots with no key are black): the frame the
 * keyboard shows then, so a fast effect in a long loop steps in the preview as it does on the keys.
 */
export function studioColours(effect: StudioEffect, plan: LoopPlan, t: number): Rgb[] {
  const at = plan.loopS > 0 ? t % plan.loopS : 0;
  const frame = Math.min(plan.frames - 1, Math.floor((at * 1000) / plan.delayMs + 1e-9));
  return coloursAt(effect, plan, (frame * plan.delayMs) / 1000);
}

export function renderFrames(effect: StudioEffect, plan: LoopPlan): Rgb[][] {
  return Array.from({ length: plan.frames }, (_, i) => coloursAt(effect, plan, (i * plan.delayMs) / 1000));
}
