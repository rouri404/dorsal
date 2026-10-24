// One screen upload, shared by the full configurator and the mini screen app.

import type { X85 } from "../protocol/x85";
import { framesToFirmware } from "./convert";
import { renderFrames, type ImageSource, type View } from "./load";
import { clampDelay } from "./packets";
import { saveLastUpload } from "./lastUpload";
import { uploadJob } from "./uploadJob";

export const SCREEN_W = 128;
export const SCREEN_H = 128;

export async function sendToScreen(kb: X85, source: ImageSource, view: View, delay: number, lang: "pt" | "en" = "pt"): Promise<boolean> {
  const animated = source.frames.length > 1;
  const en = lang === "en";
  uploadJob.start(animated ? (en ? "Sending animation" : "Enviando animação") : en ? "Sending image" : "Enviando imagem");
  try {
    const frames = renderFrames(source, SCREEN_W, SCREEN_H, view);
    const { box, pixels } = framesToFirmware(frames);
    const ok = await kb.writeScreen({ box, frames: pixels, delayMs: delay, slot: 0 }, uploadJob.progress);
    if (ok && !kb.t.dryRun) saveLastUpload(frames, clampDelay(delay));
    uploadJob.finish(ok, ok ? undefined : en ? "The keyboard did not accept the upload" : "O teclado não aceitou o envio");
    return ok;
  } catch (e) {
    uploadJob.finish(false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
