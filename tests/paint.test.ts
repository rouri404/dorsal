import { describe, expect, it } from "vitest";
import { optionFor } from "../src/protocol/effects";
import { paint, paintLayer } from "../src/app/paint";

const red = { r: 255, g: 0, b: 0 };
const blue = { r: 0, g: 0, b: 255 };
const black = { r: 0, g: 0, b: 0 };
const design = () => Array.from({ length: 128 }, (_, i) => (i < 4 ? red : black));
const LEDS = [0, 1, 2, 3, 6, 7];

describe("switching effect", () => {
  it("keeps a direction both effects have", () => {
    expect(optionFor(4, 12, 1)).toBe(1); // Wave left → Lines left
  });

  it("resets an option the new effect lacks", () => {
    expect(optionFor(4, 12, 3)).toBe(0); // Wave up → Lines has no up
    expect(optionFor(4, 2, 1)).toBe(0); // Breathing has no options
  });

  it("does not turn a direction into a design", () => {
    expect(optionFor(4, 13, 2)).toBe(0); // Wave down → per-key: design 1, not 3
  });
});

describe("painting a design", () => {
  it("paints one key with the brush", () => {
    const d = paint(design(), 7, { tool: "brush", rgb: blue }, LEDS);
    expect(d.design![7]).toEqual(blue);
    expect(d.design![6]).toEqual(black);
  });

  it("erases to black", () => {
    expect(paint(design(), 1, { tool: "eraser", rgb: blue }, LEDS).design![1]).toEqual(black);
  });

  it("fills every lit key of the same colour", () => {
    const d = paint(design(), 2, { tool: "fill", rgb: blue }, LEDS).design!;
    expect([0, 1, 2, 3].map((i) => d[i])).toEqual([blue, blue, blue, blue]);
    expect(d[6]).toEqual(black);
    // Slots with no LED are left alone.
    expect(d[100]).toEqual(black);
  });

  it("picks a colour with the eyedropper without changing the design", () => {
    const before = design();
    const r = paint(before, 0, { tool: "eyedropper", rgb: blue }, LEDS);
    expect(r.design).toBeUndefined();
    expect(r.picked).toEqual(red);
  });

  it("ignores a slot with no LED", () => {
    expect(paint(design(), 40, { tool: "brush", rgb: blue }, LEDS)).toEqual({});
  });

  it("does nothing when the key already has that colour", () => {
    expect(paint(design(), 0, { tool: "brush", rgb: red }, LEDS)).toEqual({});
  });
});

describe("painting a studio paint layer", () => {
  // Unpainted keys are null: the layer is see-through there.
  const keys = () => Array.from({ length: 128 }, (_, i) => (i < 2 ? red : null));

  it("paints a key, and black is a colour, not a hole", () => {
    expect(paintLayer(keys(), 6, { tool: "brush", rgb: black }, LEDS, blue).keys![6]).toEqual(black);
  });

  it("the eraser makes a key see-through", () => {
    expect(paintLayer(keys(), 0, { tool: "eraser", rgb: blue }, LEDS, blue).keys![0]).toBeNull();
    expect(paintLayer(keys(), 6, { tool: "eraser", rgb: blue }, LEDS, blue)).toEqual({});
  });

  it("the bucket recolours every key of that colour, or every unpainted key", () => {
    const a = paintLayer(keys(), 1, { tool: "fill", rgb: blue }, LEDS, black).keys!;
    expect([a[0], a[1], a[2], a[6]]).toEqual([blue, blue, null, null]);
    const b = paintLayer(keys(), 3, { tool: "fill", rgb: blue }, LEDS, black).keys!;
    expect([b[0], b[2], b[3], b[6], b[7], b[100]]).toEqual([red, blue, blue, blue, blue, null]);
  });

  it("the eyedropper picks the key's own colour, or what shows through it", () => {
    expect(paintLayer(keys(), 0, { tool: "eyedropper", rgb: blue }, LEDS, black)).toEqual({ picked: red });
    expect(paintLayer(keys(), 6, { tool: "eyedropper", rgb: blue }, LEDS, blue)).toEqual({ picked: blue });
  });

  it("ignores a slot with no LED", () => {
    expect(paintLayer(keys(), 40, { tool: "brush", rgb: blue }, LEDS, black)).toEqual({});
  });
});
