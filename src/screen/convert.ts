// Image -> firmware pixel data for the 16-bit TFT ("mode 16").
// Pixels are RGB565, big-endian, scanned column by column (x outer, y inner) inside
// a bounding box. Like the vendor app, the box is the union of non-black pixels
// across all frames; black outside the box is what the screen shows anyway.

export interface RGBAFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // RGBA
}

export interface Box {
  left: number;
  top: number;
  right: number; // exclusive
  bottom: number; // exclusive
}

export function rgb565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

/** Bounding box of pixels that are not pure black; the full frame if all black. */
export function contentBox(frame: RGBAFrame): Box {
  let left = frame.width, top = frame.height, right = 0, bottom = 0;
  const d = frame.data;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4;
      if (d[i] | d[i + 1] | d[i + 2]) {
        if (x < left) left = x;
        if (y < top) top = y;
        if (x + 1 > right) right = x + 1;
        if (y + 1 > bottom) bottom = y + 1;
      }
    }
  }
  if (right === 0) return { left: 0, top: 0, right: frame.width, bottom: frame.height };
  return { left, top, right, bottom };
}

export function unionBox(boxes: Box[]): Box {
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}

export function framePixels(frame: RGBAFrame, box: Box, order: "col" | "row" = "col"): Uint8Array {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const out = new Uint8Array(w * h * 2);
  let o = 0;
  const put = (x: number, y: number) => {
    const i = (y * frame.width + x) * 4;
    const v = rgb565(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
    out[o++] = v >> 8;
    out[o++] = v & 255;
  };
  if (order === "col") {
    for (let x = box.left; x < box.right; x++) for (let y = box.top; y < box.bottom; y++) put(x, y);
  } else {
    for (let y = box.top; y < box.bottom; y++) for (let x = box.left; x < box.right; x++) put(x, y);
  }
  return out;
}

export function framesToFirmware(frames: RGBAFrame[]): { box: Box; pixels: Uint8Array[] } {
  const box = unionBox(frames.map(contentBox));
  return { box, pixels: frames.map((f) => framePixels(f, box)) };
}
