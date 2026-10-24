// Dorsal Screen: a small widget that only edits the keyboard's TFT.
// Same protocol and upload path as the full configurator, one screen of controls.

import { useEffect, useRef, type ReactNode } from "react";
import { Check, Clock, Crosshair, ImagePlus, Minus, Plus, Timer, TriangleAlert, Upload, Usb, X } from "lucide-react";
import { describeConnectError, useDevice } from "../device";
import { useLang, useTr } from "../i18n";
import { DEFAULT_VIEW, type Fit } from "../screen/load";
import { clampDelay } from "../screen/packets";
import { Screen3D } from "./Screen3D";
import { SCREEN_H, SCREEN_W } from "../screen/send";
import { DELAYS, toSlider, toZoom, useScreenEditor } from "../screen/useScreenEditor";
import { cn } from "@/lib/utils";
import { RangeSlider } from "@/components/motion/range-slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/motion/select";

const IN_APP = navigator.userAgent.includes("Electron");
const NO_DRAG = "[-webkit-app-region:no-drag]";

export function MiniApp() {
  const { connect, connecting, error } = useDevice();
  const tr = useTr();
  const lang = useLang();
  const ed = useScreenEditor(170); // the TFT is about 170 px wide on the model
  const { kb, job, file, source, view, setView, delay, setDelay, clock, loadError, screen, glow, animated, uploading, canSend, zoomPct, setZoom, send, syncClock, sendLabel } = ed;
  const picker = useRef<HTMLInputElement>(null);

  return (
    <div className="grid min-h-screen place-items-center bg-transparent" onDragOver={(e) => e.preventDefault()} onDrop={ed.onDrop}>
      <main className="relative flex h-[600px] w-[420px] flex-col overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#101112] px-5 pb-4 pt-4 text-neutral-100 select-none">
        {/* Top bar doubles as the window's drag handle. */}
        <header className="relative z-10 flex h-9 items-center justify-between [-webkit-app-region:drag]">
          <span className="text-sm text-neutral-400">Dorsal Screen</span>
          {IN_APP && (
            <button
              type="button"
              onClick={() => window.close()}
              aria-label={tr("Fechar", "Close")}
              className={cn("grid size-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100", NO_DRAG)}
            >
              <X className="size-4" />
            </button>
          )}
        </header>

        {/* The keyboard's screen in 3D, lit, its light falling on the desk; the keys around
            it fade out. Dragging moves the image on the screen and the wheel zooms. */}
        <div
          className="relative -mx-5 -mt-9 h-[344px] touch-none [mask-image:radial-gradient(ellipse_56%_50%_at_50%_50%,#000_45%,transparent_100%)]"
          style={{ cursor: source ? "grab" : "default" }}
          {...ed.handlers}
          title={source ? "Arraste para posicionar, role para dar zoom" : undefined}
        >
          <canvas ref={glow} width={32} height={32} className="pointer-events-none absolute left-1/2 top-[40%] h-44 w-60 -translate-x-1/2 opacity-60 blur-[44px]" aria-hidden />
          <Screen3D
            screen={screen}
            className="relative size-full"
            fallback={
              <div className="grid size-full place-items-center">
                <div className="size-[176px] overflow-hidden rounded-[6px] border-[5px] border-[#1d1e20] bg-black">
                  <FlatScreen screen={screen} />
                </div>
              </div>
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">Zoom</span>
            <span className={cn("num", !source && "text-neutral-600")}>{zoomPct}%</span>
          </div>
          <div className="flex items-center gap-3">
            <RoundButton label={tr("Diminuir zoom", "Zoom out")} disabled={!source} onClick={() => setZoom(view.zoom / 1.25)}>
              <Minus className="size-4" />
            </RoundButton>
            <RangeSlider
              className="flex-1"
              value={toSlider(view.zoom)}
              min={0}
              max={100}
              step={1}
              showTicks={false}
              disabled={!source}
              aria-label="Zoom"
              onValueChange={(s) => setZoom(toZoom(s))}
            />
            <RoundButton label={tr("Aumentar zoom", "Zoom in")} disabled={!source} onClick={() => setZoom(view.zoom * 1.25)}>
              <Plus className="size-4" />
            </RoundButton>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Tabs value={view.fit === "contain" ? "contain" : "cover"} onValueChange={(fit) => setView({ ...DEFAULT_VIEW, fit: fit as Fit })} variant="segment">
            <TabsList className="bg-white/[0.04]">
              <TabsTrigger value="cover" disabled={!source}>{tr("Preencher", "Fill")}</TabsTrigger>
              <TabsTrigger value="contain" disabled={!source}>{tr("Inteira", "Fit")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {animated && (
            <Select value={String(delay)} onValueChange={(v) => setDelay(Number(v))}>
              <SelectTrigger aria-label={tr("Intervalo entre quadros", "Frame interval")} className="h-9 w-auto gap-2 border-white/[0.06] bg-transparent text-sm">
                <Timer className="size-4 text-neutral-400" />
                <span className="num">{clampDelay(delay)} ms</span>
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...DELAYS, clampDelay(delay)])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} ms
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="flex h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-[#1a1b1d] px-3 text-sm transition-colors hover:bg-[#202124]"
            title={file?.name}
          >
            <ImagePlus className="size-4 shrink-0 text-neutral-400" />
            <span className="truncate">{file ? tr("Trocar imagem", "Change image") : tr("Escolher imagem", "Choose image")}</span>
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-neutral-100 px-3 text-sm font-medium text-neutral-950 transition-colors hover:bg-white disabled:bg-[#1a1b1d] disabled:text-neutral-500"
          >
            {uploading && <span className="absolute inset-y-0 left-0 bg-data/30 transition-[width]" style={{ width: `${job.progress * 100}%` }} />}
            <span className="relative flex items-center gap-2">
              {job.status === "success" ? <Check className="size-4" /> : job.status === "error" ? <TriangleAlert className="size-4" /> : <Upload className="size-4" />}
              <span className="num">{sendLabel}</span>
            </span>
          </button>
        </div>

        <footer className="mt-3 flex h-7 items-center justify-between gap-3 text-xs text-neutral-500">
          {loadError || error ? (
            <span className="truncate text-red-400" title={loadError ?? (error ? describeConnectError(error, lang).hint : "")}>
              {loadError ?? (error ? describeConnectError(error, lang).title : "")}
            </span>
          ) : kb ? (
            <span className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", kb.t.isWired ? "bg-positive" : "bg-amber-400")} />
              {kb.t.isWired ? tr("Conectado pelo cabo", "Connected by cable") : tr("Pelo dongle a tela não recebe imagens", "Over the dongle the screen takes no images")}
            </span>
          ) : (
            <button type="button" onClick={connect} disabled={connecting} className="flex items-center gap-1.5 text-neutral-200 hover:text-white">
              <Usb className="size-3.5" />
              {connecting ? tr("Conectando…", "Connecting…") : tr("Conectar teclado", "Connect keyboard")}
            </button>
          )}
          <span className="flex items-center gap-1">
            <IconButton label={clock === "done" ? tr("Relógio acertado", "Clock set") : clock === "error" ? tr("Não deu para acertar o relógio", "Could not set the clock") : tr("Acertar o relógio do teclado", "Set the keyboard's clock")} disabled={!kb} onClick={syncClock}>
              {clock === "done" ? <Check className="size-4 text-positive" /> : clock === "error" ? <TriangleAlert className="size-4 text-red-400" /> : <Clock className="size-4" />}
            </IconButton>
            <IconButton label={tr("Centralizar a imagem", "Center the image")} disabled={!source} onClick={ed.center}>
              <Crosshair className="size-4" />
            </IconButton>
          </span>
        </footer>

        <input ref={picker} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onChange={(e) => e.target.files?.[0] && ed.setFile(e.target.files[0])} />
      </main>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Without WebGL: the same texture, flat. */
function FlatScreen({ screen }: { screen: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const tick = () => {
      ctx.drawImage(screen, 0, 0);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [screen]);
  return <canvas ref={ref} width={SCREEN_W} height={SCREEN_H} className="pixel size-full" />;
}

function RoundButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.06] bg-[#1a1b1d] text-neutral-300 transition-colors hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
