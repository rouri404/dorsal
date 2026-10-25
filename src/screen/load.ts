// User file (PNG/JPG/WebP/GIF) -> decoded source frames -> framed RGBA frames at the
// screen resolution. Decoding happens once; framing (fit, zoom, pan) is cheap and
// re-runs while the user adjusts the crop.

import { decompressFrames, parseGIF } from "gifuct-js";
import type { RGBAFrame } from "./convert";

export type Fit = "contain" | "cover" | "stretch";

export interface ImageSource {
  frames: HTMLCanvasElement[];
  width: number;
  height: number;
  /** Average delay per kept frame in ms (0 for still images). */
  delayMs: number;
  sourceFrames: number;
}

/** How the source is placed on the screen. Pan is in screen pixels. */
export interface View {
  fit: Fit;
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEW: View = { fit: "cover", zoom: 1, panX: 0, panY: 0 };

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponível");
  return { c, ctx };
}

export function viewRect(sw: number, sh: number, dw: number, dh: number, view: View) {
  let w: number, h: number;
  if (view.fit === "stretch") {
    w = dw;
    h = dh;
  } else {
    const scale = view.fit === "contain" ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
    w = sw * scale;
    h = sh * scale;
  }
  w *= view.zoom;
  h *= view.zoom;
  return { x: (dw - w) / 2 + view.panX, y: (dh - h) / 2 + view.panY, w, h };
}

export function drawView(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, dw: number, dh: number, view: View) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, dw, dh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const r = viewRect(src.width, src.height, dw, dh, view);
  ctx.drawImage(src, r.x, r.y, r.w, r.h);
}

export function renderFrames(source: ImageSource, width: number, height: number, view: View): RGBAFrame[] {
  const { ctx } = makeCanvas(width, height);
  return source.frames.map((f) => {
    drawView(ctx, f, width, height, view);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  });
}

async function loadStill(file: File): Promise<ImageSource> {
  const bitmap = await createImageBitmap(file);
  try {
    const { c, ctx } = makeCanvas(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return { frames: [c], width: bitmap.width, height: bitmap.height, delayMs: 0, sourceFrames: 1 };
  } finally {
    bitmap.close();
  }
}

async function loadGif(file: File, maxFrames: number): Promise<ImageSource> {
  const gif = parseGIF(await file.arrayBuffer());
  const raw = decompressFrames(gif, true);
  if (raw.length === 0) throw new Error("GIF sem frames");
  const gw = gif.lsd.width;
  const gh = gif.lsd.height;
  const full = makeCanvas(gw, gh);
  const patch = makeCanvas(1, 1);
  const frames: HTMLCanvasElement[] = [];
  const step = Math.max(1, Math.ceil(raw.length / maxFrames));
  let totalDelay = 0;

  let saved: ImageData | null = null;
  raw.forEach((f, i) => {
    // Composite GIF patches like a browser would, honouring the previous frame's disposal:
    // 2 restores its area to the background, 3 restores what was there before it.
    const prev = i > 0 ? raw[i - 1] : null;
    if (prev?.disposalType === 2) full.ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height);
    if (prev?.disposalType === 3 && saved) full.ctx.putImageData(saved, 0, 0);
    saved = f.disposalType === 3 ? full.ctx.getImageData(0, 0, gw, gh) : null;
    patch.c.width = f.dims.width;
    patch.c.height = f.dims.height;
    const img = patch.ctx.createImageData(f.dims.width, f.dims.height);
    img.data.set(f.patch);
    patch.ctx.putImageData(img, 0, 0);
    full.ctx.drawImage(patch.c, f.dims.left, f.dims.top);
    totalDelay += f.delay || 100;
    if (i % step === 0) {
      const snap = makeCanvas(gw, gh);
      snap.ctx.drawImage(full.c, 0, 0);
      frames.push(snap.c);
    }
  });

  // Skipped frames lengthen the delay of the ones we keep.
  return { frames, width: gw, height: gh, delayMs: (totalDelay / raw.length) * step, sourceFrames: raw.length };
}

export function loadImageSource(file: File, maxFrames: number): Promise<ImageSource> {
  const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
  return isGif ? loadGif(file, maxFrames) : loadStill(file);
}
