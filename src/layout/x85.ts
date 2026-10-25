// Physical layout of the X85 Pro: 81-key 75% ANSI with a knob and a 0.85" TFT.
// Derived from the key matrix the keyboard reports (pos = column * 6 + row); the
// two ISO slots in the matrix (# and the extra \) have no physical key.
// Units: x and w in key widths (1u), the board is 16.5u wide and 6 rows tall.

export interface PhysicalKey {
  pos: number;
  x: number;
  y: number;
  w: number;
  /** How far the cap sits below its row (the arrow cluster is dropped a little). */
  dy?: number;
}

export interface VirtualKey {
  pos: number;
  label: string;
}

export const BOARD_UNITS = 16.5;
const RIGHT = 15.5;
export const BOARD_ROWS = 6;

const p = (col: number, row: number) => col * 6 + row;

function row(y: number, keys: [col: number, w: number][], startX = 0, dy?: number): PhysicalKey[] {
  let x = startX;
  return keys.map(([col, w]) => {
    const k: PhysicalKey = { pos: p(col, y), x, y, w, ...(dy && { dy }) };
    x += w;
    return k;
  });
}

const ones = (from: number, to: number): [number, number][] => Array.from({ length: to - from + 1 }, (_, i) => [from + i, 1]);

export const X85_KEYS: PhysicalKey[] = [
  // F-row groups are a quarter unit apart; the right column is half a unit off the main block.
  ...row(0, [[0, 1]]),
  ...row(0, ones(1, 4), 1.25),
  ...row(0, ones(5, 8), 5.5),
  ...row(0, ones(9, 12), 9.75),
  ...row(0, [[13, 1]], 14),
  ...row(1, [...ones(0, 12), [13, 2]]),
  ...row(1, [[14, 1]], RIGHT),
  ...row(2, [[0, 1.5], ...ones(1, 12), [13, 1.5]]),
  ...row(2, [[14, 1]], RIGHT),
  ...row(3, [[0, 1.75], ...ones(1, 11), [13, 2.25]]),
  ...row(3, [[14, 1]], RIGHT),
  // The arrows float a quarter unit right of and below their rows.
  ...row(4, [[0, 2.25], ...ones(2, 11), [12, 1.75]]),
  ...row(4, [[13, 1]], 14.25, 0.25),
  ...row(5, [[0, 1.25], [1, 1.25], [2, 1.25], [6, 6.25], [9, 1], [10, 1], [11, 1]]),
  ...row(5, ones(12, 14), 13.25, 0.25),
];

export const KNOB_PRESS = p(14, 0);
export const SCREEN_SLOT = { x: RIGHT, y: 4, w: 1 };
export const KNOB_SLOT = { x: RIGHT, y: 0, w: 1 };
export const INDICATORS = [1, 2, 3].map((y) => ({ x: RIGHT - 0.25, y }));

/** Matrix entries without a key cap: knob rotation and on-board screen functions. */
export const X85_VIRTUAL: VirtualKey[] = [
  { pos: KNOB_PRESS, label: "Knob: apertar" },
  { pos: p(15, 0), label: "Knob: girar à esquerda" },
  { pos: p(15, 1), label: "Knob: girar à direita" },
  { pos: p(15, 2), label: "Extra 1 (tela)" },
  { pos: p(15, 3), label: "Extra 2 (tela)" },
  { pos: p(15, 4), label: "Extra 3 (tela)" },
];
