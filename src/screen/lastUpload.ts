// Remembers the last image sent to the keyboard. The firmware cannot read the
// screen back, so this local copy is what the UI shows as "on the screen now".

import { useEffect, useState } from "react";
import type { RGBAFrame } from "./convert";

const KEY = "x85.lastScreenUpload";
const EVENT = "x85:screen-upload";
/** Caps what is stored so a long GIF stays well under the storage quota. */
const MAX_STORED_FRAMES = 40;

export interface StoredUpload {
  frames: string[]; // PNG data URLs
  delayMs: number;
  width: number;
  height: number;
  savedAt: number;
}

let memoryCopy: StoredUpload | null = null;

function toDataUrl(frame: RGBAFrame): string {
  const c = document.createElement("canvas");
  c.width = frame.width;
  c.height = frame.height;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(frame.width, frame.height);
  img.data.set(frame.data);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function saveLastUpload(frames: RGBAFrame[], delayMs: number): void {
  if (frames.length === 0) return;
  const step = Math.max(1, Math.ceil(frames.length / MAX_STORED_FRAMES));
  const kept = frames.filter((_, i) => i % step === 0);
  const upload: StoredUpload = {
    frames: kept.map(toDataUrl),
    delayMs: delayMs * step,
    width: frames[0].width,
    height: frames[0].height,
    savedAt: Date.now(),
  };
  memoryCopy = upload;
  try {
    localStorage.setItem(KEY, JSON.stringify(upload));
  } catch {
    // quota or storage disabled: keep the in-memory copy for this session
  }
  window.dispatchEvent(new Event(EVENT));
}

function readLastUpload(): StoredUpload | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StoredUpload;
  } catch {
    // fall through to the in-memory copy
  }
  return memoryCopy;
}

export function useLastUpload(): StoredUpload | null {
  const [value, setValue] = useState<StoredUpload | null>(() => readLastUpload());
  useEffect(() => {
    const refresh = () => setValue(readLastUpload());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}
