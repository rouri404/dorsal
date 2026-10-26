// The per-key paint tools: what a click on a key does to a design (one colour per matrix slot).

import type { Rgb } from "../protocol/x85";

export type Tool = "brush" | "eraser" | "fill" | "eyedropper";
export interface Brush {
  tool: Tool;
  rgb: Rgb;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const same = (a: Rgb | undefined, b: Rgb) => !!a && a.r === b.r && a.g === b.g && a.b === b.b;

/**
 * Applies the brush to the key at `pos`. Gives the new design when something changed, or the
 * colour picked by the eyedropper; nothing for a slot with no LED or a stroke that changes nothing.
 * `leds` are the slots that have a light.
 */
export function paint(design: Rgb[], pos: number, brush: Brush, leds: readonly number[]): { design?: Rgb[]; picked?: Rgb } {
  if (!leds.includes(pos)) return {};
  const here = design[pos] ?? BLACK;
  if (brush.tool === "eyedropper") return { picked: here };
  const colour = brush.tool === "eraser" ? BLACK : brush.rgb;
  const targets = brush.tool === "fill" ? leds.filter((p) => same(design[p] ?? BLACK, here)) : [pos];
  if (targets.every((p) => same(design[p], colour))) return {};
  const next = design.slice();
  for (const p of targets) next[p] = colour;
  return { design: next };
}

/** Both painted the same colour, or both unpainted. */
const sameOrNone = (a: Rgb | null | undefined, b: Rgb | null) => (a && b ? same(a, b) : !a && !b);

/**
 * The same tools on a studio paint layer, whose unpainted keys (null) let the layers below show:
 * the eraser makes a key see-through, the bucket on one recolours every unpainted key, and the
 * eyedropper picks what shows through it (`shown`).
 */
export function paintLayer(keys: (Rgb | null)[], pos: number, brush: Brush, leds: readonly number[], shown: Rgb): { keys?: (Rgb | null)[]; picked?: Rgb } {
  if (!leds.includes(pos)) return {};
  const here = keys[pos] ?? null;
  if (brush.tool === "eyedropper") return { picked: here ?? shown };
  const colour = brush.tool === "eraser" ? null : brush.rgb;
  const targets = brush.tool === "fill" ? leds.filter((p) => sameOrNone(keys[p], here)) : [pos];
  if (targets.every((p) => sameOrNone(keys[p], colour))) return {};
  const next = keys.slice();
  for (const p of targets) next[p] = colour;
  return { keys: next };
}
