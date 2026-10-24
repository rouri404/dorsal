// Physical layout of the X85 Pro: 81-key 75% ANSI with a knob and a 0.85" TFT.
// Derived from the key matrix the keyboard reports (pos = column * 6 + row); the
// two ISO slots in the matrix (# and the extra \) have no physical key.
// Units: x and w in key widths (1u), the board is 16u wide and 6 rows tall.

export interface PhysicalKey {
  pos: number;
  x: number;
  y: number;
  w: number;
}

export interface VirtualKey {
  pos: number;
  label: string;
}

export const BOARD_UNITS = 16;
export const BOARD_ROWS = 6;

const p = (col: number, row: number) => col * 6 + row;

function row(y: number, keys: [col: number, w: number][], startX = 0): PhysicalKey[] {
  let x = startX;
  return keys.map(([col, w]) => {
    const k = { pos: p(col, y), x, y, w };
    x += w;
    return k;
  });
}

const ones = (from: number, to: number): [number, number][] => Array.from({ length: to - from + 1 }, (_, i) => [from + i, 1]);

export const X85_KEYS: PhysicalKey[] = [
  // Esc · F1–F4 · F5–F8 · F9–F12 · Del, in groups with a quarter-unit gap between them
  // (as on the board); Del sits right against the knob, which is at the far right.
  ...row(0, [[0, 1]]),
  ...row(0, ones(1, 4), 1.25),
  ...row(0, ones(5, 8), 5.5),
  ...row(0, ones(9, 12), 9.75),
  ...row(0, [[13, 1]], 14),
  ...row(1, [...ones(0, 12), [13, 2], [14, 1]]),
  ...row(2, [[0, 1.5], ...ones(1, 12), [13, 1.5], [14, 1]]),
  ...row(3, [[0, 1.75], ...ones(1, 11), [13, 2.25], [14, 1]]),
  ...row(4, [[0, 2.25], ...ones(2, 11), [12, 1.75], [13, 1]]),
  ...row(5, [[0, 1.25], [1, 1.25], [2, 1.25], [6, 6.25], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1]]),
];

/** Knob press sits physically in the top-right corner. */
export const KNOB_PRESS = p(14, 0);
/** The TFT fills the gap right of ↑, directly above →. */
export const SCREEN_SLOT = { x: 15, y: 4, w: 1 };
export const KNOB_SLOT = { x: 15, y: 0, w: 1 };

/** Matrix entries without a key cap: knob rotation and on-board screen functions. */
export const X85_VIRTUAL: VirtualKey[] = [
  { pos: KNOB_PRESS, label: "Knob: apertar" },
  { pos: p(15, 0), label: "Knob: girar à esquerda" },
  { pos: p(15, 1), label: "Knob: girar à direita" },
  { pos: p(15, 2), label: "Extra 1 (tela)" },
  { pos: p(15, 3), label: "Extra 2 (tela)" },
  { pos: p(15, 4), label: "Extra 3 (tela)" },
];
