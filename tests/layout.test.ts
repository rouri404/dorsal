import { describe, expect, it } from "vitest";
import { BOARD_UNITS, KNOB_SLOT, SCREEN_SLOT, X85_KEYS, X85_VIRTUAL } from "../src/layout/x85";
import { keyLabel } from "../src/protocol/keycodes";
import dump from "./fixtures/x85-wired-readonly-dump.json";

const matrix = Uint8Array.from(dump.keymatrix_p0.match(/../g)!.map((b) => parseInt(b, 16)));
const slot = (pos: number) => Array.from(matrix.slice(pos * 4, pos * 4 + 4));

describe("X85 physical layout", () => {
  it("has the 81 keys of a 75% board, each on a real matrix slot", () => {
    expect(X85_KEYS).toHaveLength(81);
    expect(new Set(X85_KEYS.map((k) => k.pos)).size).toBe(81);
    for (const k of X85_KEYS) expect(slot(k.pos).some((b) => b !== 0)).toBe(true);
  });

  it("keeps every row inside 16u without overlaps", () => {
    const occupied = [...X85_KEYS, { ...SCREEN_SLOT }, { ...KNOB_SLOT }];
    for (let y = 0; y < 6; y++) {
      const row = occupied.filter((k) => k.y === y).sort((a, b) => a.x - b.x);
      row.forEach((k, i) => {
        expect(k.x + k.w).toBeLessThanOrEqual(BOARD_UNITS);
        if (i > 0) expect(k.x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w);
      });
    }
  });

  it("puts the expected keys where a 75% board has them", () => {
    const at = (x: number, y: number) => keyLabel(slot(X85_KEYS.find((k) => k.x === x && k.y === y)!.pos));
    expect(at(0, 0)).toBe("Esc");
    expect(at(13, 1)).toBe("Backspace");
    expect(at(12.75, 3)).toBe("Enter");
    expect(at(14, 4)).toBe("↑");
    expect(at(3.75, 5)).toBe("Espaço");
    expect(at(14, 5)).toBe("↓");
  });

  it("places the screen directly above the right arrow", () => {
    const right = X85_KEYS.find((k) => k.y === 5 && k.x === 15)!;
    expect(keyLabel(slot(right.pos))).toBe("→");
    expect(SCREEN_SLOT).toMatchObject({ x: 15, y: 4 });
  });

  it("maps the knob to mute and volume", () => {
    expect(X85_VIRTUAL.slice(0, 3).map((v) => keyLabel(slot(v.pos)))).toEqual(["Mudo", "Volume −", "Volume +"]);
  });
});
