import { describe, expect, it } from "vitest";
import { checksumByte, encodePacket } from "../src/hid/packet";
import { keyLabel } from "../src/protocol/keycodes";
import { X85, X85_DEVICE_ID } from "../src/protocol/x85";
import type { Transport } from "../src/hid/transport";
import dump from "./fixtures/x85-wired-readonly-dump.json";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

/** Replays responses captured from the real keyboard, keyed by command byte. */
function fakeTransport(sent: number[][], extra: Record<number, (cmd: number[]) => Uint8Array | undefined> = {}) {
  const pages = (s: string) => Array.from({ length: 8 }, (_, i) => hex(s).slice(i * 64, i * 64 + 64));
  const km = pages(dump.keymatrix_p0);
  const fn = pages(dump.fn_win_p0);
  const replies: Record<number, (cmd: number[]) => Uint8Array> = {
    0x8f: () => hex(dump.usbver_8f),
    0x83: () => hex(dump.report_83),
    0x87: () => hex(dump.ledparam_87),
    0x88: () => hex(dump.sled_88),
    0x91: () => hex(dump.sleep_91),
    0xad: () => hex(dump.oled_ad),
    0x8a: (c) => km[c[3]],
    0x90: (c) => fn[c[4]],
    ...extra,
  };
  const reply = (cmd: ArrayLike<number>) => {
    const c = Array.from(cmd);
    sent.push(c);
    return replies[c[0]]?.(c);
  };
  return {
    isWired: true,
    dryRun: false,
    query: async (cmd: ArrayLike<number>) => reply(cmd),
    queryInBatch: async (cmd: ArrayLike<number>) => reply(cmd),
    send: async (cmd: ArrayLike<number>) => (sent.push(Array.from(cmd)), true),
    sendInBatch: async (cmd: ArrayLike<number>) => (sent.push(Array.from(cmd)), true),
    batch: <T>(fn: () => Promise<T>) => fn(),
  } as unknown as Transport;
}

describe("packet framing", () => {
  it("matches the checksum the keyboard echoes back", () => {
    // The firmware echoes unsupported commands verbatim, so these are real encoder outputs.
    expect(encodePacket([0x84])[7]).toBe(0x7b);
    expect(encodePacket([0x89])[7]).toBe(0x76);
    expect(encodePacket([0x91])[7]).toBe(0x6e);
  });

  it("puts the bit8 checksum at byte 8", () => {
    const p = encodePacket([0x07, 1, 0, 4, 7, 250, 255, 250], "bit8");
    expect(p[8]).toBe(checksumByte(p, "bit8"));
    expect(p[7]).toBe(250);
    expect(p.length).toBe(64);
  });
});

describe("X85 decoding (real captures)", () => {
  it("identifies the X85 Pro", async () => {
    const kb = new X85(fakeTransport([]));
    expect((await kb.identity())?.deviceId).toBe(X85_DEVICE_ID);
  });

  it("reads the screen chip", async () => {
    const info = await new X85(fakeTransport([])).screenInfo();
    expect(info?.chip).toBe("RY5060");
    expect(info?.screenVersion).toBe(0x0102);
  });

  it("decodes lighting and sleep", async () => {
    const kb = new X85(fakeTransport([]));
    expect(await kb.light()).toEqual({ mode: 1, speed: 0, brightness: 4, option: 0, rainbow: false, rgb: { r: 250, g: 255, b: 250 } });
    expect(await kb.sleep()).toEqual({ btSeconds: 120, rfSeconds: 120, btDeepSeconds: 1680, rfDeepSeconds: 1680 });
  });

  it("decodes the 75% layout from the key matrix", async () => {
    const sent: number[][] = [];
    const map = (await new X85(fakeTransport(sent)).keymap())!;
    expect(sent.map((c) => c.slice(0, 5))).toEqual(Array.from({ length: 8 }, (_, n) => [0x8a, 0, 0xff, n, 0]));
    const at = (col: number, row: number) => keyLabel(map[col * 6 + row]);
    expect([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(0, 4), at(0, 5)]).toEqual(["Esc", "`", "Tab", "Caps", "LShift", "LCtrl"]);
    expect(at(1, 0)).toBe("F1");
    expect(at(13, 0)).toBe("Del");
    expect(at(10, 5)).toBe("Fn");
    expect(at(14, 0)).toBe("Mudo");
  });
});

describe("effect options", () => {
  it("decodes the option nibble", async () => {
    const kb = new X85(fakeTransport([], { 0x87: () => hex("8704040427ff0000") }));
    expect(await kb.light()).toMatchObject({ mode: 4, option: 2, rainbow: false, rgb: { r: 255, g: 0, b: 0 } });
  });

  it("writes the option nibble", async () => {
    const sent: number[][] = [];
    await new X85(fakeTransport(sent)).setLight({ mode: 4, speed: 2, brightness: 4, option: 3, rainbow: true, rgb: { r: 1, g: 2, b: 3 } });
    expect(sent[0]).toEqual([0x07, 4, 2, 4, 0x38, 1, 2, 3]);
  });

  it("writes mode 13 like the vendor app", async () => {
    const sent: number[][] = [];
    await new X85(fakeTransport(sent)).setLight({ mode: 13, speed: 2, brightness: 3, option: 2, rainbow: false, rgb: { r: 255, g: 0, b: 0 } });
    expect(sent[0]).toEqual([0x07, 13, 2, 3, 0x20, 0x00, 0xc8, 0xc8]);
  });
});

describe("music", () => {
  it("streams 42 band heights, clamped to 0..6, in one 0x0D packet without waits or logging", async () => {
    const calls: { cmd: number[]; opts: unknown }[] = [];
    const t = { send: async (cmd: ArrayLike<number>, opts: unknown) => (calls.push({ cmd: Array.from(cmd), opts }), true) } as unknown as Transport;
    const heights = Array.from({ length: 42 }, (_, i) => (i % 9) - 1);
    expect(await new X85(t).music(heights)).toBe(true);
    expect(calls[0].cmd).toEqual([0x0d, 0, 0, 0, 0, 0, 0, 0, ...heights.map((h) => Math.min(6, Math.max(0, h)))]);
    expect(calls[0].opts).toMatchObject({ sendDelay: 0, quiet: true, write: true });
    // The checksum covers bytes 0..6, as for every bit7 command.
    expect(encodePacket(calls[0].cmd)[7]).toBe(0xff - 0x0d);
  });

  it("writes the music modes' colour flag: 0 for the rainbow, 4 for the colour", async () => {
    const sent: number[][] = [];
    const kb = new X85(fakeTransport(sent));
    await kb.setLight({ mode: 20, speed: 2, brightness: 4, option: 0, rainbow: true, rgb: { r: 1, g: 2, b: 3 } });
    await kb.setLight({ mode: 22, speed: 2, brightness: 3, option: 0, rainbow: false, rgb: { r: 10, g: 20, b: 30 } });
    expect(sent[0]).toEqual([0x07, 20, 2, 4, 0x00, 1, 2, 3]);
    expect(sent[1]).toEqual([0x07, 22, 2, 3, 0x04, 10, 20, 30]);
  });

  it("reads the music modes' colour flag back", async () => {
    const rainbow = new X85(fakeTransport([], { 0x87: () => hex("8714020400010203") }));
    expect(await rainbow.light()).toMatchObject({ mode: 20, rainbow: true, rgb: { r: 1, g: 2, b: 3 } });
    const colour = new X85(fakeTransport([], { 0x87: () => hex("87160203040a141e") }));
    expect(await colour.light()).toMatchObject({ mode: 22, rainbow: false, rgb: { r: 10, g: 20, b: 30 } });
  });
});

describe("per-key colours", () => {
  // Six 64-byte pages; slot n holds RGB (n, 255 - n, n & 15).
  const design = Uint8Array.from({ length: 6 * 64 }, (_, i) => {
    const slot = Math.floor(i / 3);
    return [slot & 255, 255 - (slot & 255), slot & 15][i % 3];
  });
  const page = (c: number[]) => Uint8Array.from(design.slice(c[3] * 64, c[3] * 64 + 64));

  it("reads a design", async () => {
    const sent: number[][] = [];
    const colours = (await new X85(fakeTransport(sent, { 0x8c: page })).perKey(2))!;
    expect(sent.map((c) => c.slice(0, 4))).toEqual(Array.from({ length: 6 }, (_, n) => [0x8c, 2, 0xff, n]));
    expect(colours).toHaveLength(128);
    expect(colours[0]).toEqual({ r: 0, g: 255, b: 0 });
    expect(colours[127]).toEqual({ r: 127, g: 128, b: 15 });
  });

  it("gives nothing when a page is missing", async () => {
    const kb = new X85(fakeTransport([], { 0x8c: (c) => (c[3] === 4 ? undefined : page(c)) }));
    expect(await kb.perKey(0)).toBeUndefined();
  });

  it("writes a design in seven pages", async () => {
    const sent: number[][] = [];
    const colours = Array.from({ length: 128 }, (_, n) => ({ r: n, g: 1, b: 2 }));
    await new X85(fakeTransport(sent)).setPerKey(2, colours);
    expect(sent).toHaveLength(7);
    expect(sent.map((c) => c.slice(0, 7))).toEqual([
      ...Array.from({ length: 6 }, (_, n) => [0x0c, 2, 0xff, n, 56, 0, 0]),
      [0x0c, 2, 0xff, 6, 42, 1, 0],
    ]);
    expect(sent.every((c) => c.length === 64)).toBe(true);
    // Slot 5 is bytes 15..17 of the first page's data, which starts at byte 8.
    expect(sent[0].slice(8 + 15, 8 + 18)).toEqual([5, 1, 2]);
    // Slot 125 is the last one stored: data byte 375 = page 6, offset 375 - 336 = 39; after it, padding.
    expect(sent[6].slice(8 + 39, 8 + 42)).toEqual([125, 1, 2]);
    expect(sent[6].slice(8 + 42).every((b) => b === 0)).toBe(true);
  });
});

describe("X85 writes", () => {
  it("encodes a single-key remap like the vendor app", async () => {
    const sent: number[][] = [];
    await new X85(fakeTransport(sent)).setKey(7, [0, 0, 0x04, 0]);
    expect(sent[0]).toEqual([0x0a, 0, 7, 0, 0, 1, 0, 0, 0, 0, 0x04, 0]);
  });

  it("encodes the screen clock", async () => {
    const sent: number[][] = [];
    await new X85(fakeTransport(sent)).syncClock(new Date(2026, 9, 24, 13, 5, 9));
    expect(sent[0].slice(8, 15)).toEqual([0x07, 0xea, 10, 24, 13, 5, 9]);
  });
});

describe("per-key animation", () => {
  // Slot n of frame f is RGB (n, f, 7).
  const frames = [0, 1].map((f) => Array.from({ length: 128 }, (_, n) => ({ r: n, g: f, b: 7 })));

  it("uploads an animation as the vendor app does", async () => {
    const sent: number[][] = [];
    const progress: number[] = [];
    expect(await new X85(fakeTransport(sent)).setAnimation(frames, 30, (d) => progress.push(d))).toBe(true);
    expect(sent[0]).toEqual([0x12]);
    expect(sent).toHaveLength(1 + 14);
    sent.slice(1).forEach((p, i) => {
      expect(p.slice(0, 8)).toEqual([0x12, Math.floor(i / 7), i % 7, 1, 2, 30, 0, 0]);
      expect(p).toHaveLength(64);
    });
    // Slot 5 of frame 1: byte 15 of the frame's data, so page 0, offset 8 + 15.
    expect(sent[1 + 7].slice(8 + 15, 8 + 18)).toEqual([5, 1, 7]);
    // Page 6 carries the last 48 bytes (slots 112..127), then zeros.
    const last = sent[1 + 6];
    expect(last.slice(8, 11)).toEqual([112, 0, 7]);
    expect(last.slice(8 + 45, 8 + 48)).toEqual([127, 0, 7]);
    expect(last.slice(8 + 48)).toEqual(new Array(8).fill(0));
    expect(progress.at(-1)).toBe(1);
  });

  it("stops at the first failed page", async () => {
    const sent: number[][] = [];
    const t = fakeTransport(sent);
    let n = 0;
    t.sendInBatch = async (cmd: ArrayLike<number>) => (sent.push(Array.from(cmd)), ++n !== 5);
    expect(await new X85(t).setAnimation(frames, 30)).toBe(false);
    expect(sent).toHaveLength(5);
  });
});
