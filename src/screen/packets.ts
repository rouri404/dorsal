// Packet layout for screen uploads (commands 0xA5 begin / 0x25 data).
//
// begin: [0xA5, frameIndex, frameCount, delayMs, lenB0, lenB1, 0, chk,
//         left, top, right, bottom, leftHi, topHi, rightHi, bottomHi, lenB2, lenB3, slot]
// data:  [0x25, frameIndex, frameCount, delayMs, chunkLo, chunkHi, chunkLen, chk, ...56 bytes]
//
// A still image goes into `slot` (frameIndex = slot, frameCount = 1). An animation
// is sent as frames 0..n-1 with slot 0, matching the vendor app.

import type { Box } from "./convert";

export const SCREEN_BEGIN = 0xa5;
export const SCREEN_DATA = 0x25;
export const CHUNK = 56;
export const MAX_DELAY_MS = 255;

export interface ScreenUpload {
  box: Box;
  /** One RGB565 buffer per frame, all covering `box`. */
  frames: Uint8Array[];
  /** Per-frame delay in ms (animations only). */
  delayMs: number;
  /** Target slot for a still image (0-based). */
  slot: number;
}

export interface ScreenPlan {
  begin: number[];
  chunks: number[][];
}

export function clampDelay(ms: number): number {
  return Math.max(1, Math.min(MAX_DELAY_MS, Math.round(ms)));
}

export function buildScreenUpload(u: ScreenUpload): ScreenPlan {
  if (u.frames.length === 0) throw new Error("nenhum frame para enviar");
  const animated = u.frames.length > 1;
  const frameCount = u.frames.length & 255;
  const delay = animated ? clampDelay(u.delayMs) : 0;
  const firstIndex = animated ? 0 : u.slot & 255;
  const len = u.frames[0].length;
  const { left, top, right, bottom } = u.box;

  const begin = new Array<number>(19).fill(0);
  begin[0] = SCREEN_BEGIN;
  begin[1] = firstIndex;
  begin[2] = frameCount;
  begin[3] = delay;
  begin[4] = len & 255;
  begin[5] = (len >> 8) & 255;
  begin[8] = left & 255;
  begin[9] = top & 255;
  begin[10] = right & 255;
  begin[11] = bottom & 255;
  begin[12] = left >> 8;
  begin[13] = top >> 8;
  begin[14] = right >> 8;
  begin[15] = bottom >> 8;
  begin[16] = (len >> 16) & 255;
  begin[17] = (len >>> 24) & 255;
  begin[18] = animated ? 0 : u.slot & 255;

  const chunks: number[][] = [];
  u.frames.forEach((pixels, f) => {
    const frameIndex = animated ? f : u.slot & 255;
    const n = Math.ceil(pixels.length / CHUNK);
    for (let c = 0; c < n; c++) {
      const part = pixels.subarray(c * CHUNK, (c + 1) * CHUNK);
      const pkt = new Array<number>(8 + CHUNK).fill(0);
      pkt[0] = SCREEN_DATA;
      pkt[1] = frameIndex;
      pkt[2] = frameCount;
      pkt[3] = delay;
      pkt[4] = c & 255;
      pkt[5] = (c >> 8) & 255;
      pkt[6] = part.length;
      for (let i = 0; i < part.length; i++) pkt[8 + i] = part[i];
      chunks.push(pkt);
    }
  });
  return { begin, chunks };
}
