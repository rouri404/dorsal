// State and actions of the screen editor: the chosen file, its framing, the TFT canvas
// that previews it, the upload. Shared by the mini app and the prototype.

import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from "react";
import { useDevice } from "../device";
import { DEFAULT_VIEW, drawView, loadImageSource, type ImageSource, type View } from "./load";
import { clampDelay } from "./packets";
import { useLastUpload } from "./lastUpload";
import { SCREEN_H, SCREEN_W, sendToScreen } from "./send";
import { useUploadJob } from "./uploadJob";
import { drawClockFace } from "./clockFace";
import { useLang } from "../i18n";

const MAX_FRAMES = 60;
// The zoom slider is logarithmic: 0 → 20%, 100 → 800%, 100% sits a little left of centre.
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 8;
export const toZoom = (s: number) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, s / 100);
export const toSlider = (z: number) => Math.round((100 * Math.log(z / ZOOM_MIN)) / Math.log(ZOOM_MAX / ZOOM_MIN));
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
export const DELAYS = [30, 50, 80, 100, 150, 200, 255];

/** `screenPx`: how wide the TFT is drawn on screen (or a getter, when it changes), so dragging moves the image under the pointer. */
export function useScreenEditor(screenPx: number | (() => number)) {
  const { kb } = useDevice();
  const lang = useLang();
  const tr = (pt: string, en: string) => (lang === "en" ? en : pt);
  const job = useUploadJob();
  const last = useLastUpload();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ImageSource | null>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [delay, setDelay] = useState(100);
  const [clock, setClock] = useState<"idle" | "done" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  // What the TFT shows, drawn off-screen: the 3D model's screen texture.
  const [screen] = useState(() => Object.assign(document.createElement("canvas"), { width: SCREEN_W, height: SCREEN_H }));
  /** A small canvas that mirrors the TFT, blurred into its glow. */
  const glow = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Screenshot aid (see electron/main.cjs, X85_SAMPLE): preload an image passed as a data URL.
  useEffect(() => {
    const sample = new URLSearchParams(window.location.search).get("sample");
    if (sample)
      void fetch(sample)
        .then((r) => r.blob())
        .then((b) => setFile(new File([b], tr("amostra.png", "sample.png"), { type: b.type })));
  }, []);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoadError(null);
    loadImageSource(file, MAX_FRAMES)
      .then((src) => {
        if (cancelled) return;
        setSource(src);
        setView(DEFAULT_VIEW);
        if (src.frames.length > 1) setDelay(clampDelay(src.delayMs));
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [file]);

  // The TFT shows the chosen image framed as it will be sent; with none chosen, the
  // last image sent to the keyboard.
  useEffect(() => {
    const ctx = screen.getContext("2d");
    if (!ctx) return;
    const blank = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    };
    // Nothing of the user's known yet: the keyboard's own clock face, ticking.
    let frame: (i: number) => void = () => drawClockFace(ctx, SCREEN_W, SCREEN_H, lang);
    let count = 1;
    let interval = 100;
    if (source) {
      frame = (i) => drawView(ctx, source.frames[i], SCREEN_W, SCREEN_H, view);
      count = source.frames.length;
      interval = clampDelay(delay);
    } else if (last) {
      const images = last.frames.map((src) => Object.assign(new Image(), { src }));
      frame = (i) => {
        blank();
        if (images[i].complete) ctx.drawImage(images[i], 0, 0, SCREEN_W, SCREEN_H);
      };
      count = images.length;
      interval = Math.max(20, last.delayMs);
    }
    let i = 0;
    const draw = () => {
      frame(i);
      const g = glow.current?.getContext("2d");
      if (g) g.drawImage(screen, 0, 0, g.canvas.width, g.canvas.height);
    };
    draw();
    // A still image redraws now and then too, so a stored frame that was still decoding appears.
    const timer = setInterval(() => {
      i = (i + 1) % count;
      draw();
    }, count > 1 ? interval : 250);
    return () => clearInterval(timer);
  }, [screen, source, view, delay, last, lang]);

  const setZoom = (z: number) => setView((v) => ({ ...v, zoom: clampZoom(z) }));
  const uploading = job.status === "uploading";

  return {
    kb,
    job,
    file,
    setFile,
    source,
    view,
    setView,
    delay,
    setDelay,
    clock,
    loadError,
    screen,
    glow,
    animated: (source?.frames.length ?? 0) > 1,
    uploading,
    canSend: !!kb && !!source && kb.t.isWired && !uploading,
    zoomPct: Math.round(view.zoom * 100),
    setZoom,
    center: () => setView((v) => ({ ...DEFAULT_VIEW, fit: v.fit })),
    send: () => {
      if (kb && source) void sendToScreen(kb, source, view, delay, lang).catch(() => undefined);
    },
    syncClock: async () => {
      if (!kb) return;
      const ok = await kb.syncClock().catch(() => false);
      setClock(ok ? "done" : "error");
      setTimeout(() => setClock("idle"), 2500);
    },
    sendLabel:
      job.status === "uploading"
        ? tr(`Enviando ${Math.round(job.progress * 100)}%`, `Sending ${Math.round(job.progress * 100)}%`)
        : job.status === "success"
          ? tr("Enviado", "Sent")
          : job.status === "error"
            ? tr("Falhou, tentar de novo", "Failed, try again")
            : tr("Enviar para a tela", "Send to screen"),
    /** Drag to move the image on the TFT, wheel to zoom, drop a file anywhere. */
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (!source) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (!drag.current) return;
        const k = SCREEN_W / (typeof screenPx === "function" ? screenPx() : screenPx);
        const dx = (e.clientX - drag.current.x) * k;
        const dy = (e.clientY - drag.current.y) * k;
        drag.current = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      },
      onPointerUp: () => (drag.current = null),
      onPointerCancel: () => (drag.current = null),
      onWheel: (e: WheelEvent<HTMLElement>) => {
        if (source) setZoom(view.zoom * Math.exp(-e.deltaY * 0.0015));
      },
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) setFile(f);
    },
  };
}

export type ScreenEditor = ReturnType<typeof useScreenEditor>;
