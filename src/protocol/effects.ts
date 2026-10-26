// The key light effects of the X85 (byte 1 of 0x07), with what each one takes: its options (the
// high nibble of byte 4), a colour and a speed. Taken from the vendor app's effect table.

export interface Effect {
  id: number;
  pt: string;
  en: string;
  /** Labels [pt, en] of the option values 0, 1, … */
  options?: [string, string][];
  colour: boolean;
  speed: boolean;
}

/** Per-key colours: the option picks one of the five designs. */
export const PER_KEY_MODE = 13;

/** Plays the animation uploaded with 0x12 (LightUserColor). */
export const ANIMATION_MODE = 25;
/**
 * Frames an animation can safely use. The vendor editor allows 200, but the start command does not
 * clear the whole area: past about 100 frames the keyboard plays leftovers of earlier uploads
 * (100 frames played clean on the keyboard, 160 did not).
 */
export const MAX_FRAMES = 100;

const RIGHT_LEFT: [string, string][] = [
  ["Para a direita", "Right"],
  ["Para a esquerda", "Left"],
];

const fx = (id: number, pt: string, en: string, more: Partial<Effect> = {}): Effect => ({ id, pt, en, colour: true, speed: true, ...more });

export const EFFECTS: Effect[] = [
  fx(0, "Desligado", "Off", { colour: false, speed: false }),
  fx(1, "Sempre aceso", "Always on", { speed: false }),
  fx(2, "Respiração", "Breathing"),
  fx(3, "Neon", "Neon", { colour: false }),
  fx(4, "Onda", "Wave", { options: [...RIGHT_LEFT, ["Para baixo", "Down"], ["Para cima", "Up"]] }),
  fx(5, "Ondulação", "Ripple"),
  fx(6, "Gota de chuva", "Raindrop"),
  fx(7, "Cobra", "Snake", { options: [["Zigue-zague", "Zigzag"], ["Espiral", "Spiral"]] }),
  fx(8, "Reação ao toque", "Reactive"),
  fx(9, "Convergência", "Converge"),
  fx(10, "Onda senoidal", "Sine wave"),
  fx(11, "Caleidoscópio", "Kaleidoscope", { options: [["Para fora", "Outward"], ["Para dentro", "Inward"]] }),
  fx(12, "Linhas", "Lines", { options: RIGHT_LEFT }),
  fx(PER_KEY_MODE, "Cores por tecla", "Per-key colours", {
    colour: false,
    speed: false,
    options: [1, 2, 3, 4, 5].map((n) => [`Desenho ${n}`, `Design ${n}`] as [string, string]),
  }),
  fx(14, "Laser", "Laser"),
  fx(15, "Onda circular", "Circular wave", { options: [["Anti-horário", "Anticlockwise"], ["Horário", "Clockwise"]] }),
  fx(16, "Arco-íris", "Rainbow"),
  fx(17, "Chuva", "Rain"),
  fx(18, "Meteoro", "Meteor"),
  fx(19, "Toque (apaga)", "Reactive (off)"),
  fx(23, "Trem", "Train"),
  fx(24, "Fogos", "Fireworks"),
  fx(ANIMATION_MODE, "Personalizado", "Custom", { colour: false, speed: false }),
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));
export const effectOf = (id: number): Effect | undefined => BY_ID.get(id);

/** The option to keep when switching effect: the same one if it means the same thing there (Wave left → Lines left), else 0. */
export function optionFor(from: number, to: number, option: number): number {
  const label = effectOf(from)?.options?.[option]?.[1];
  return label !== undefined && effectOf(to)?.options?.[option]?.[1] === label ? option : 0;
}
