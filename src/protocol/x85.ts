// Command set for the Attack Shark X85 Pro (RongYuan RY5060 firmware, device id 3451).
// Settings use the YC3123/RY5088 command table; the TFT screen uses the shared
// RongYuan screen commands. Every GET below was verified against the real
// keyboard over USB; writes mirror the vendor web app byte for byte.

import { Transport } from "../hid/transport";
import { sleep } from "../hid/timer";
import type { KeyValue } from "./keycodes";
import { buildScreenUpload, type ScreenUpload } from "../screen/packets";
import { isMusicMode, PER_KEY_MODE } from "./effects";

const CMD = {
  RESET: 0x01,
  SET_REPORT_RATE: 0x03,
  SET_PROFILE: 0x04,
  SET_DEBOUNCE: 0x06,
  SET_LIGHT: 0x07,
  SET_PER_KEY: 0x0c,
  SET_ANIMATION: 0x12,
  MUSIC: 0x0d,
  SET_KEY: 0x0a,
  SET_FN_KEY: 0x10,
  SET_SLEEP: 0x11,
  SCREEN_DATA: 0x25,
  SCREEN_CLOCK: 0x28,
  GET_REPORT_RATE: 0x83,
  GET_PROFILE: 0x84,
  GET_POWER_SAVE: 0x85,
  GET_DEBOUNCE: 0x86,
  GET_LIGHT: 0x87,
  GET_PER_KEY: 0x8c,
  GET_KEYMATRIX: 0x8a,
  GET_IDENTITY: 0x8f,
  GET_FN_KEYMATRIX: 0x90,
  GET_SLEEP: 0x91,
  SCREEN_BEGIN: 0xa5,
  GET_SCREEN_VERSION: 0xad,
} as const;

export const X85_DEVICE_ID = 3451;
/** Slots in the column-major key matrix (16 columns x 6 rows on the X85). */
const MATRIX_SLOTS = 128;

// Byte 4: the high nibble is the effect's option; the low nibble is 7 for the custom RGB, 8 for
// rainbow ("dazzle"), and other values pick a preset color.
const LIGHT_NORMAL = 7;
const LIGHT_DAZZLE = 8;
/** The colour flag in the music modes (low nibble of byte 4), from the vendor's driver. */
const MUSIC_RAINBOW = 0;
const MUSIC_COLOUR = 4;
const LIGHT_MAX_SPEED = 4;
const PRESET_COLORS = [0xff0000, 0xff8000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff];

export const REPORT_RATES = [8000, 4000, 2000, 1000, 500, 250, 125];

export interface Identity {
  deviceId: number;
  firmware: number;
  bootloader: boolean;
}
export interface ScreenInfo {
  screenVersion: number;
  flashVersion: number;
  chip: string;
}
export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface LightSetting {
  mode: number;
  speed: number; // 0..4, higher is faster
  brightness: number; // 0..4
  /** The effect's option (direction, variant or per-key design), 0..15. */
  option: number;
  rainbow: boolean;
  rgb: { r: number; g: number; b: number };
}
export interface SleepSetting {
  btSeconds: number;
  rfSeconds: number;
  btDeepSeconds: number;
  rfDeepSeconds: number;
}

const u16 = (d: Uint8Array, at: number) => d[at] | (d[at + 1] << 8);

export class X85 {
  readonly t: Transport;

  constructor(transport: Transport) {
    this.t = transport;
  }

  async identity(): Promise<Identity | undefined> {
    const r = await this.t.query([CMD.GET_IDENTITY]);
    if (!r || r[0] !== CMD.GET_IDENTITY) return undefined;
    const id = (r[1] | (r[2] << 8) | (r[3] << 16) | (r[4] << 24)) >>> 0;
    return { deviceId: id, firmware: (r[8] << 8) | r[7], bootloader: r[9] === 1 };
  }

  async screenInfo(): Promise<ScreenInfo | undefined> {
    const r = await this.t.query([CMD.GET_SCREEN_VERSION], { readDelay: 100 });
    if (!r || r[0] !== CMD.GET_SCREEN_VERSION) return undefined;
    const chip = String.fromCharCode(...r.slice(13, 19).filter((c) => c >= 0x20 && c < 0x7f));
    return { screenVersion: u16(r, 1), flashVersion: u16(r, 3), chip };
  }

  async reportRate(): Promise<number | undefined> {
    const r = await this.t.query([CMD.GET_REPORT_RATE]);
    return r ? REPORT_RATES[r[2]] : undefined;
  }

  async setReportRate(hz: number): Promise<boolean> {
    const idx = REPORT_RATES.indexOf(hz);
    if (idx < 0) return false;
    return this.t.send([CMD.SET_REPORT_RATE, 0, idx], { write: true });
  }

  async profile(): Promise<number | undefined> {
    const r = await this.t.query([CMD.GET_PROFILE]);
    return r ? r[1] : undefined;
  }

  async debounce(): Promise<number | undefined> {
    const r = await this.t.query([CMD.GET_DEBOUNCE]);
    return r ? r[1] : undefined;
  }

  async setDebounce(ms: number): Promise<boolean> {
    return this.t.send([CMD.SET_DEBOUNCE, ms & 255], { write: true });
  }

  async powerSave(): Promise<boolean | undefined> {
    const r = await this.t.query([CMD.GET_POWER_SAVE]);
    return r ? r[1] === 1 : undefined;
  }

  async sleep(): Promise<SleepSetting | undefined> {
    const r = await this.t.query([CMD.GET_SLEEP]);
    if (!r) return undefined;
    return { btSeconds: u16(r, 8), rfSeconds: u16(r, 10), btDeepSeconds: u16(r, 12), rfDeepSeconds: u16(r, 14) };
  }

  async setSleep(s: SleepSetting): Promise<boolean> {
    const p = new Uint8Array(16);
    p[0] = CMD.SET_SLEEP;
    [s.btSeconds, s.rfSeconds, s.btDeepSeconds, s.rfDeepSeconds].forEach((v, i) => {
      p[8 + i * 2] = v & 255;
      p[9 + i * 2] = (v >> 8) & 255;
    });
    return this.t.send(p, { write: true });
  }

  async factoryReset(): Promise<boolean> {
    return this.t.send([CMD.RESET], { write: true });
  }

  private decodeLight(r: Uint8Array): LightSetting {
    const low = r[4] & 15;
    let rgb = { r: r[5], g: r[6], b: r[7] };
    // The music modes flag the rainbow with 0 and the colour with 4.
    if (isMusicMode(r[1])) return { mode: r[1], speed: LIGHT_MAX_SPEED - r[2], brightness: r[3], option: r[4] >> 4, rainbow: low === MUSIC_RAINBOW, rgb };
    if (low !== LIGHT_NORMAL && low !== LIGHT_DAZZLE && PRESET_COLORS[low] !== undefined) {
      const c = PRESET_COLORS[low];
      rgb = { r: c >> 16, g: (c >> 8) & 255, b: c & 255 };
    }
    return {
      mode: r[1],
      speed: LIGHT_MAX_SPEED - r[2],
      brightness: r[3],
      option: r[4] >> 4,
      rainbow: low === LIGHT_DAZZLE,
      rgb,
    };
  }

  async light(): Promise<LightSetting | undefined> {
    const r = await this.t.query([CMD.GET_LIGHT]);
    return r && r[0] === CMD.GET_LIGHT ? this.decodeLight(r) : undefined;
  }

  async setLight(l: LightSetting): Promise<boolean> {
    const option = (l.option & 15) << 4;
    // Per-key colours: the vendor app writes no colour flag and a fixed colour.
    const colour = isMusicMode(l.mode) ? (l.rainbow ? MUSIC_RAINBOW : MUSIC_COLOUR) : l.rainbow ? LIGHT_DAZZLE : LIGHT_NORMAL;
    const tail = l.mode === PER_KEY_MODE ? [option, 0x00, 0xc8, 0xc8] : [option | colour, l.rgb.r, l.rgb.g, l.rgb.b];
    return this.t.send([CMD.SET_LIGHT, l.mode, LIGHT_MAX_SPEED - l.speed, l.brightness, ...tail], { checksum: "bit8", write: true });
  }

  /** A per-key design (0..4): one colour per matrix slot, or nothing if a page did not come. */
  perKey(design: number): Promise<Rgb[] | undefined> {
    return this.t.batch(async () => {
      const bytes: number[] = [];
      for (let page = 0; page < 6; page++) {
        const r = await this.t.queryInBatch([CMD.GET_PER_KEY, design, 0xff, page]);
        if (!r) return undefined;
        bytes.push(...r);
      }
      return Array.from({ length: MATRIX_SLOTS }, (_, i) => ({ r: bytes[i * 3], g: bytes[i * 3 + 1], b: bytes[i * 3 + 2] }));
    });
  }

  /** Writes a design in seven pages of 56 bytes; the last one carries 42 and a flag, so slots 126 and 127 are not stored. */
  setPerKey(design: number, colours: Rgb[]): Promise<boolean> {
    const data = new Array(MATRIX_SLOTS * 3).fill(0);
    colours.slice(0, MATRIX_SLOTS).forEach((c, i) => data.splice(i * 3, 3, c.r, c.g, c.b));
    return this.t.batch(async () => {
      for (let page = 0; page < 7; page++) {
        const last = page === 6;
        const chunk = data.slice(page * 56, page * 56 + (last ? 42 : 56));
        const p = [CMD.SET_PER_KEY, design, 0xff, page, last ? 42 : 56, last ? 1 : 0, 0, 0, ...chunk, ...new Array(56 - chunk.length).fill(0)];
        if (!(await this.t.sendInBatch(p, { write: true }))) return false;
      }
      return true;
    });
  }

  /**
   * Uploads a looping animation: a start command, then each frame in seven pages of 56 bytes
   * (128 slots of RGB, the last page padded). It plays in ANIMATION_MODE; the mode is not changed.
   */
  setAnimation(frames: Rgb[][], delayMs: number, onProgress?: (done: number) => void): Promise<boolean> {
    return this.t.batch(async () => {
      if (!(await this.t.sendInBatch([CMD.SET_ANIMATION], { write: true }))) return false;
      await sleep(300);
      for (let f = 0; f < frames.length; f++) {
        const data = new Array(MATRIX_SLOTS * 3).fill(0);
        frames[f].slice(0, MATRIX_SLOTS).forEach((c, i) => data.splice(i * 3, 3, c.r, c.g, c.b));
        for (let page = 0; page < 7; page++) {
          const chunk = data.slice(page * 56, page * 56 + 56);
          const p = [CMD.SET_ANIMATION, f, page, 1, frames.length, delayMs & 255, (delayMs >> 8) & 255, 0, ...chunk, ...new Array(56 - chunk.length).fill(0)];
          if (!(await this.t.sendInBatch(p, { write: true }))) return false;
        }
        onProgress?.((f + 1) / frames.length);
      }
      return true;
    });
  }

  private async readMatrix(page: (n: number) => number[]): Promise<KeyValue[] | undefined> {
    return this.t.batch(async () => {
      const bytes: number[] = [];
      for (let n = 0; n < 8; n++) {
        const r = await this.t.queryInBatch(page(n));
        if (!r) return undefined;
        bytes.push(...r);
      }
      const slots: KeyValue[] = [];
      for (let i = 0; i < MATRIX_SLOTS; i++) slots.push(bytes.slice(i * 4, i * 4 + 4) as KeyValue);
      return slots;
    });
  }

  keymap(profile = 0, layer = 0): Promise<KeyValue[] | undefined> {
    return this.readMatrix((n) => [CMD.GET_KEYMATRIX, profile, 0xff, n, layer]);
  }

  /** Fn layer for an OS (0 = Windows, 1 = macOS). */
  fnKeymap(os = 0, fnProfile = 0): Promise<KeyValue[] | undefined> {
    return this.readMatrix((n) => [CMD.GET_FN_KEYMATRIX, os, fnProfile, 0xff, n]);
  }

  setKey(pos: number, value: KeyValue, profile = 0, layer = 0): Promise<boolean> {
    return this.t.send([CMD.SET_KEY, profile, pos, 0, 0, 1, layer, 0, ...value], { write: true });
  }

  setFnKey(pos: number, value: KeyValue, os = 0, fnProfile = 0): Promise<boolean> {
    return this.t.send([CMD.SET_FN_KEY, os, fnProfile, pos, 0, 0, 0, 0, ...value], { write: true });
  }

  /**
   * One frame of the music modes: 42 band heights 0..6, low to high, which the keyboard draws
   * itself. Sent every 20 ms, so with no wait before it and left out of the log.
   */
  music(heights: number[]): Promise<boolean> {
    const h = heights.map((x) => Math.min(6, Math.max(0, Math.round(x))));
    return this.t.send([CMD.MUSIC, 0, 0, 0, 0, 0, 0, 0, ...h], { sendDelay: 0, quiet: true, write: true });
  }

  async syncClock(date = new Date()): Promise<boolean> {
    const p = new Uint8Array(16);
    p[0] = CMD.SCREEN_CLOCK;
    const y = date.getFullYear();
    p[8] = y >> 8;
    p[9] = y & 255;
    p[10] = date.getMonth() + 1;
    p[11] = date.getDate();
    p[12] = date.getHours();
    p[13] = date.getMinutes();
    p[14] = date.getSeconds();
    return this.t.send(p, { write: true });
  }

  /** A still image goes into `slot`; an animation uploads all frames. Cable only. */
  async writeScreen(upload: ScreenUpload, onProgress?: (fraction: number) => void): Promise<boolean> {
    if (!this.t.isWired) throw new Error("A tela só aceita upload pelo cabo USB.");
    const plan = buildScreenUpload(upload);
    return this.t.batch(async () => {
      // Handshake: the firmware answers byte[1] === 1 once it is ready for data.
      let ready = false;
      for (let attempt = 0; attempt < 10 && !ready; attempt++) {
        const r = await this.t.queryInBatch(plan.begin, { sendDelay: 100, readDelay: 100, write: true });
        ready = this.t.dryRun || (r !== undefined && r[1] === 1);
      }
      if (!ready) return false;
      await sleep(100);
      const total = plan.chunks.length;
      for (let i = 0; i < total; i++) {
        if (!(await this.t.sendInBatch(plan.chunks[i], { sendDelay: 1, write: true }))) return false;
        if (onProgress && (i % 16 === 0 || i === total - 1)) onProgress((i + 1) / total);
      }
      return true;
    });
  }
}

