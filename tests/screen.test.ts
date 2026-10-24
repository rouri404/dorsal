import { describe, expect, it } from "vitest";
import { contentBox, framesToFirmware, rgb565, type RGBAFrame } from "../src/screen/convert";
import { buildScreenUpload, CHUNK } from "../src/screen/packets";

function frame(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): RGBAFrame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

describe("pixel conversion", () => {
  it("packs RGB565", () => {
    expect(rgb565(255, 255, 255)).toBe(0xffff);
    expect(rgb565(255, 0, 0)).toBe(0xf800);
    expect(rgb565(0, 255, 0)).toBe(0x07e0);
    expect(rgb565(0, 0, 255)).toBe(0x001f);
  });

  it("crops to non-black content and scans column-major, big-endian", () => {
    // 4x3 black frame with a red pixel at (1,0) and a blue one at (2,1).
    const f = frame(4, 3, (x, y) => (x === 1 && y === 0 ? [255, 0, 0] : x === 2 && y === 1 ? [0, 0, 255] : [0, 0, 0]));
    expect(contentBox(f)).toEqual({ left: 1, top: 0, right: 3, bottom: 2 });
    const { pixels } = framesToFirmware([f]);
    // order: (1,0) red, (1,1) black, (2,0) black, (2,1) blue
    expect(Array.from(pixels[0])).toEqual([0xf8, 0x00, 0, 0, 0, 0, 0x00, 0x1f]);
  });

  it("sends the whole frame when the image is all black", () => {
    expect(contentBox(frame(8, 8, () => [0, 0, 0]))).toEqual({ left: 0, top: 0, right: 8, bottom: 8 });
  });
});

describe("screen packets", () => {
  const box = { left: 0, top: 0, right: 128, bottom: 128 };
  const full = new Uint8Array(128 * 128 * 2).fill(0xab);

  it("builds the begin handshake for a still image in slot 3", () => {
    const plan = buildScreenUpload({ box, frames: [full], delayMs: 0, slot: 2 });
    const len = full.length; // 32768
    expect(plan.begin.slice(0, 6)).toEqual([0xa5, 2, 1, 0, len & 255, (len >> 8) & 255]);
    expect(plan.begin.slice(8, 16)).toEqual([0, 0, 128, 128, 0, 0, 0, 0]);
    expect(plan.begin[18]).toBe(2);
    expect(plan.chunks.length).toBe(Math.ceil(len / CHUNK));
  });

  it("numbers data chunks and pads the last one", () => {
    const plan = buildScreenUpload({ box, frames: [full], delayMs: 0, slot: 0 });
    const last = plan.chunks[plan.chunks.length - 1];
    const lastIndex = plan.chunks.length - 1;
    expect(last.slice(0, 7)).toEqual([0x25, 0, 1, 0, lastIndex & 255, lastIndex >> 8, full.length % CHUNK]);
    expect(last.length).toBe(64);
  });

  it("sends animations as frames 0..n-1 with a clamped delay", () => {
    const small = new Uint8Array(10);
    const plan = buildScreenUpload({ box: { left: 0, top: 0, right: 5, bottom: 1 }, frames: [small, small, small], delayMs: 900, slot: 4 });
    expect(plan.begin.slice(1, 4)).toEqual([0, 3, 255]);
    expect(plan.begin[18]).toBe(0);
    expect(plan.chunks.map((c) => c[1])).toEqual([0, 1, 2]);
  });
});
