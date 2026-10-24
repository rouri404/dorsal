import { describe, expect, it } from "vitest";
import { checksumByte, encodePacket } from "../src/hid/packet";
import { keyLabel } from "../src/protocol/keycodes";
import { X85, X85_DEVICE_ID } from "../src/protocol/x85";
import type { Transport } from "../src/hid/transport";
import dump from "./fixtures/x85-wired-readonly-dump.json";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

/** Replays responses captured from the real keyboard, keyed by command byte. */
function fakeTransport(sent: number[][]) {
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
    expect(await kb.light()).toEqual({ mode: 1, speed: 0, brightness: 4, rainbow: false, rgb: { r: 250, g: 255, b: 250 } });
    expect((await kb.sideLight())?.rainbow).toBe(true);
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
