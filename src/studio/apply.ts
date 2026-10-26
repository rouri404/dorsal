// Stores a studio effect on the keyboard: render the loop, upload it, and only then switch to
// the mode that plays it, so a failed upload leaves the light as it was. The keyboard keeps its
// animation, so when it already holds this effect only the mode and brightness are written.

import { ANIMATION_MODE } from "../protocol/effects";
import type { LightSetting, X85 } from "../protocol/x85";
import type { StudioEffect } from "./effect";
import { planLoop, renderFrames } from "./render";

export async function applyStudio(
  kb: Pick<X85, "setAnimation" | "setLight">,
  effect: StudioEffect,
  light: LightSetting,
  onProgress?: (done: number) => void,
  stored?: StudioEffect | null,
): Promise<boolean> {
  if (JSON.stringify(effect.layers) !== JSON.stringify(stored?.layers)) {
    const plan = planLoop(effect);
    if (!(await kb.setAnimation(renderFrames(effect, plan), plan.delayMs, onProgress))) return false;
  }
  return kb.setLight({ ...light, mode: ANIMATION_MODE, option: 0 });
}
