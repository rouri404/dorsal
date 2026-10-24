import { describe, expect, it } from "vitest";
import { FACTORY_BASE } from "../src/layout/x85-factory";
import { X85_KEYS, X85_VIRTUAL } from "../src/layout/x85";
import { keyLabel, sameValue, type KeyValue } from "../src/protocol/keycodes";
import { viewRect, DEFAULT_VIEW } from "../src/screen/load";
import dump from "./fixtures/x85-wired-readonly-dump.json";

const bytes = Uint8Array.from(dump.keymatrix_p0.match(/../g)!.map((b) => parseInt(b, 16)));
const current = (pos: number) => Array.from(bytes.slice(pos * 4, pos * 4 + 4)) as KeyValue;

describe("factory keymap", () => {
  it("has Home, PgUp, PgDn in the right column", () => {
    const col14 = [1, 2, 3].map((row) => keyLabel(FACTORY_BASE[14 * 6 + row]));
    expect(col14).toEqual(["Home", "PgUp", "PgDn"]);
  });

  it("flags exactly the owner's three remaps on the captured keyboard", () => {
    const positions = [...X85_KEYS.map((k) => k.pos), ...X85_VIRTUAL.map((v) => v.pos)];
    const edited = positions.filter((p) => !sameValue(FACTORY_BASE[p], current(p)));
    expect(edited.map((p) => keyLabel(current(p)))).toEqual(["Ins", "PrtSc", "Macro 1"]);
  });
});

describe("screen framing", () => {
  it("covers the square screen with a wide photo by default", () => {
    const r = viewRect(400, 200, 128, 128, DEFAULT_VIEW);
    expect(r).toEqual({ x: -64, y: 0, w: 256, h: 128 });
  });

  it("zooms around the centre and pans in screen pixels", () => {
    const r = viewRect(128, 128, 128, 128, { fit: "contain", zoom: 2, panX: 10, panY: -5 });
    expect(r).toEqual({ x: -54, y: -69, w: 256, h: 256 });
  });
});
