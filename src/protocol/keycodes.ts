// Key values are 4 bytes per matrix slot: [type, a, b, c].
//   type 0  -> keyboard usage: [0, modifierMask, usage, usage2] (or [0, usage, 0, 0] for extended keys)
//   type 1  -> mouse button / wheel
//   type 2  -> system control (power, sleep, wake)
//   type 3  -> consumer control: [3, 0, usageLo, usageHi]
//   type 9  -> macro: [9, mode, macroIndex, 0]
//   type 10 -> Fn / lock functions
//   type 13 -> backlight control (effect, brightness, speed), Fn layer
//   type 14 -> connection: Bluetooth slots and the 2.4G receiver, Fn layer
//   type 19 -> on-board screen functions (X85 knob column)

export type KeyValue = [number, number, number, number];

export const HID_NAMES: Record<number, string> = {
  0x28: "Enter", 0x29: "Esc", 0x2a: "Backspace", 0x2b: "Tab", 0x2c: "Espaço", 0x2d: "-", 0x2e: "=",
  0x2f: "[", 0x30: "]", 0x31: "\\", 0x32: "#", 0x33: ";", 0x34: "'", 0x35: "`", 0x36: ",", 0x37: ".",
  0x38: "/", 0x39: "Caps", 0x46: "PrtSc", 0x47: "ScrLk", 0x48: "Pause", 0x49: "Ins", 0x4a: "Home",
  0x4b: "PgUp", 0x4c: "Del", 0x4d: "End", 0x4e: "PgDn", 0x4f: "→", 0x50: "←", 0x51: "↓", 0x52: "↑",
  0x53: "NumLk", 0x54: "KP /", 0x55: "KP *", 0x56: "KP -", 0x57: "KP +", 0x58: "KP Enter", 0x63: "KP .",
  0x64: "\\ | ABNT2", 0x65: "Menu",
  0xe0: "LCtrl", 0xe1: "LShift", 0xe2: "LAlt", 0xe3: "Super", 0xe4: "RCtrl", 0xe5: "RShift", 0xe6: "RAlt", 0xe7: "RSuper",
};
for (let i = 0; i < 26; i++) HID_NAMES[0x04 + i] = String.fromCharCode(65 + i);
for (let i = 0; i < 10; i++) HID_NAMES[0x1e + i] = String((i + 1) % 10);
for (let i = 0; i < 12; i++) HID_NAMES[0x3a + i] = `F${i + 1}`;
for (let i = 0; i < 12; i++) HID_NAMES[0x68 + i] = `F${i + 13}`;
for (let i = 0; i < 9; i++) HID_NAMES[0x59 + i] = `KP ${i + 1}`;
HID_NAMES[0x62] = "KP 0";

const MODIFIER_BITS = ["Ctrl", "Shift", "Alt", "Super", "RCtrl", "RShift", "RAlt", "RSuper"];

/** Named special functions (same 4-byte values the vendor app writes). `short` fits on a keycap. */
export const FUNCTIONS: { label: string; value: KeyValue; short?: string }[] = [
  { label: "Mudo", value: [3, 0, 0xe2, 0] },
  { label: "Volume −", value: [3, 0, 0xea, 0] },
  { label: "Volume +", value: [3, 0, 0xe9, 0] },
  { label: "Play/Pause", value: [3, 0, 0xcd, 0] },
  { label: "Próxima faixa", value: [3, 0, 0xb5, 0] },
  { label: "Faixa anterior", value: [3, 0, 0xb6, 0] },
  { label: "Parar", value: [3, 0, 0xb7, 0] },
  { label: "Player", value: [3, 0, 0x83, 1] },
  { label: "Calculadora", value: [3, 0, 0x92, 1] },
  { label: "E-mail", value: [3, 0, 0x8a, 1] },
  { label: "Meu computador", value: [3, 0, 0x94, 1] },
  { label: "Pesquisar", value: [3, 0, 0x21, 2] },
  { label: "Página inicial (navegador)", value: [3, 0, 0x23, 2] },
  { label: "Voltar (navegador)", value: [3, 0, 0x24, 2] },
  { label: "Atualizar (navegador)", value: [3, 0, 0x27, 2] },
  { label: "Brilho do monitor −", short: "Monitor −", value: [3, 0, 0x70, 0] },
  { label: "Brilho do monitor +", short: "Monitor +", value: [3, 0, 0x6f, 0] },
  // From the factory Fn layer; names follow the keyboard's manual.
  { label: "Bluetooth 1 (segure: parear)", short: "BT 1", value: [0x0e, 0, 0, 0] },
  { label: "Bluetooth 2 (segure: parear)", short: "BT 2", value: [0x0e, 0, 1, 0] },
  { label: "Bluetooth 3 (segure: parear)", short: "BT 3", value: [0x0e, 0, 2, 0] },
  { label: "Receptor 2.4G (segure: parear)", short: "2.4G", value: [0x0e, 0, 5, 0] },
  { label: "Luz: próximo efeito", short: "Efeito", value: [0x0d, 1, 0, 0] },
  { label: "Luz: mais brilho", short: "Luz +", value: [0x0d, 2, 1, 0] },
  { label: "Luz: menos brilho", short: "Luz −", value: [0x0d, 2, 2, 0] },
  { label: "Luz: mais devagar", short: "Vel. −", value: [0x0d, 3, 1, 0] },
  { label: "Luz: mais rápido", short: "Vel. +", value: [0x0d, 3, 2, 0] },
  { label: "Luz: próxima cor", short: "Cor", value: [0x0d, 5, 1, 0] },
  { label: "Luz: apagar/acender", short: "Luz", value: [10, 9, 0, 0] },
  { label: "Travar a tecla Super", short: "Trava Super", value: [10, 3, 0, 0] },
  { label: "Restaurar fábrica (segure 3 s)", short: "Reset", value: [10, 2, 0, 0] },
  { label: "Ver a bateria (sem fio)", short: "Bateria", value: [10, 8, 0, 0] },
  { label: "Área de trabalho (Super+D)", short: "Desktop", value: [0, 0, 0xe3, 0x07] },
  { label: "Alternar janelas (Super+Tab)", short: "Janelas", value: [0, 0, 0xe3, 0x2b] },
  { label: "Emoji (Super+.)", short: "Emoji", value: [0, 0, 0xe3, 0x37] },
  { label: "Desligar PC", value: [2, 0, 0x81, 0] },
  { label: "Suspender PC", value: [2, 0, 0x82, 0] },
  { label: "Acordar PC", value: [2, 0, 0x83, 0] },
  { label: "Fn", value: [10, 1, 0, 0] },
  { label: "Bloquear tela (Super+L)", value: [0, 0, 0xe3, 0x0f] },
  { label: "Clique esquerdo", value: [1, 0, 0xf0, 0] },
  { label: "Clique direito", value: [1, 0, 0xf1, 0] },
  { label: "Clique do meio", value: [1, 0, 0xf2, 0] },
  { label: "Botão 4 do mouse", value: [1, 0, 0xf3, 0] },
  { label: "Botão 5 do mouse", value: [1, 0, 0xf4, 0] },
  { label: "Desativada", value: [0, 0, 0, 0] },
];

export function sameValue(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function modifierPrefix(mask: number): string {
  const parts: string[] = [];
  MODIFIER_BITS.forEach((name, bit) => {
    if (mask & (1 << bit)) parts.push(name);
  });
  return parts.length ? parts.join("+") + "+" : "";
}

export function keyShortLabel(v: ArrayLike<number>): string {
  const fn = FUNCTIONS.find((f) => sameValue(f.value, v));
  if (fn?.short) return fn.short;
  const t = v[0];
  if (t === 10 && v[1] !== 1) return "?";
  if (t === 13 || t === 14) return "?";
  return keyLabel(v);
}

/** No function assigned (an empty slot in the Fn layer does nothing while Fn is held). */
export const isEmpty = (v: ArrayLike<number> | undefined) => !v || (v[0] === 0 && v[1] === 0 && v[2] === 0 && v[3] === 0);

export function keyLabel(v: ArrayLike<number>): string {
  const [t, a, b, c] = [v[0], v[1], v[2], v[3]];
  if (t === 0 && a === 0 && b === 0 && c === 0) return "—";
  const fn = FUNCTIONS.find((f) => sameValue(f.value, v));
  if (fn) return fn.label;
  if (t === 0) {
    // [0, usage, 0, 0] is how the firmware stores keys outside the first byte range.
    if (b === 0 && c === 0 && a !== 0) return HID_NAMES[a] ?? `HID 0x${a.toString(16)}`;
    const main = HID_NAMES[b] ?? `HID 0x${b.toString(16)}`;
    const second = c ? `+${HID_NAMES[c] ?? `0x${c.toString(16)}`}` : "";
    return modifierPrefix(a) + main + second;
  }
  if (t === 3) return `Mídia 0x${((c << 8) | b).toString(16)}`;
  if (t === 9) return `Macro ${b + 1}`;
  if (t === 10) return a === 1 ? "Fn" : `Função do sistema não identificada (10.${a})`;
  if (t === 13) return `Função de luz não identificada (${a}.${b})`;
  if (t === 14) return `Conexão não identificada (${b})`;
  if (t === 19) return `Tela ${a}.${b}`;
  return `[${Array.from(v).map((x) => x.toString(16).padStart(2, "0")).join(" ")}]`;
}

export function keyValue(usage: number, modifiers = 0): KeyValue {
  return [0, modifiers, usage, 0];
}

/** Extra search words for keys whose name alone is hard to guess. */
export const KEY_KEYWORDS: Record<number, string[]> = {
  0x64: ["ISO", "pipe", "barra invertida", "backslash"],
};

export const KEY_GROUPS: { title: string; usages: number[] }[] = [
  { title: "Letras", usages: Array.from({ length: 26 }, (_, i) => 0x04 + i) },
  { title: "Números", usages: Array.from({ length: 10 }, (_, i) => 0x1e + i) },
  { title: "F1–F24", usages: [...Array.from({ length: 12 }, (_, i) => 0x3a + i), ...Array.from({ length: 12 }, (_, i) => 0x68 + i)] },
  { title: "Símbolos", usages: [0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x64, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38] },
  { title: "Edição", usages: [0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x39, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x65] },
  { title: "Setas", usages: [0x50, 0x52, 0x51, 0x4f] },
  { title: "Modificadores", usages: [0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7] },
  { title: "Teclado numérico", usages: [0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x61, 0x62, 0x63] },
];
