import { describe, expect, it } from "vitest";
import { DemoTransport } from "../src/demo/DemoTransport";
import { X85 } from "../src/protocol/x85";
import type { Transport } from "../src/hid/transport";

describe("demo keyboard", () => {
  it("starts with black designs and keeps a design written to it", async () => {
    const kb = new X85(new DemoTransport() as unknown as Transport);
    expect((await kb.perKey(3))!.every((c) => !c.r && !c.g && !c.b)).toBe(true);
    // Slots 126 and 127 are not stored (the write carries 126 colours), so they stay black.
    const colours = Array.from({ length: 128 }, (_, n) => (n < 126 ? { r: n, g: 255 - n, b: 7 } : { r: 0, g: 0, b: 0 }));
    expect(await kb.setPerKey(3, colours)).toBe(true);
    expect(await kb.perKey(3)).toEqual(colours);
    expect((await kb.perKey(2))![5]).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("demo keyboard animation", () => {
  it("keeps an uploaded animation", async () => {
    const demo = new DemoTransport();
    const kb = new X85(demo as unknown as Transport);
    const frames = Array.from({ length: 3 }, () => Array.from({ length: 128 }, () => ({ r: 1, g: 2, b: 3 })));
    expect(await kb.setAnimation(frames, 40)).toBe(true);
    expect(demo.animation).toEqual({ frames: 3, delayMs: 40, pages: 21 });
    const light = (await kb.light())!;
    expect(await kb.setLight({ ...light, mode: 25, option: 0 })).toBe(true);
    expect((await kb.light())!.mode).toBe(25);
  });
});
