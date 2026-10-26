// The configurator: the board in 3D as the stage, each section's controls in a dock below.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Cable, Check, Clock, Copy, Crosshair, Download, ImagePlus, RotateCcw, ShieldCheck, Timer, Trash2, TriangleAlert, Upload, Usb } from "lucide-react";
import { describeConnectError, useAction, useDevice, type ConnectError } from "../device";
import { loadEffects, loadOnKeyboard, mergeEffects, removeEffect, saveEffects, saveOnKeyboard, upsertEffect } from "../studio/store";
import { colourAt as keyColourAt, newEffect, paintArea, type StudioEffect } from "../studio/effect";
import { planLoop } from "../studio/render";
import { applyStudio } from "../studio/apply";
import { BackupError, applyRestore, isEmptyPlan, parseBackup, planRestore, readCurrent, readPerKey, type RestorePlan } from "../backup";
import { FACTORY_BASE, FACTORY_FN_WIN } from "../layout/x85-factory";
import { X85_KEYS, X85_VIRTUAL } from "../layout/x85";
import { FUNCTIONS, HID_NAMES, KEY_GROUPS, KEY_KEYWORDS, isEmpty, keyValue, sameValue, type KeyValue } from "../protocol/keycodes";
import { REPORT_RATES, type LightSetting, type Rgb, type SleepSetting } from "../protocol/x85";
import { ANIMATION_MODE, EFFECTS, PER_KEY_MODE, effectOf, optionFor } from "../protocol/effects";
import { DEFAULT_VIEW, type Fit } from "../screen/load";
import { clampDelay } from "../screen/packets";
import { SCREEN_H, SCREEN_W } from "../screen/send";
import { DELAYS, toSlider, toZoom, useScreenEditor, type ScreenEditor } from "../screen/useScreenEditor";
import { studioJob, useStudioJob, useUploadJob } from "../screen/uploadJob";
import type { LogEntry } from "../hid/transport";
import { useLang, useTr, type Lang } from "../i18n";
import { keyName, keyShortName, labelIn } from "../i18n/labels";
import { navigate, pathOf, type Section } from "../router";
import { isDevMode } from "../devMode";
import { Logo, PRODUCT, SITE } from "../brand";
import { Board3D, type Framing } from "./Board3D";
import { Card, Dock, PaintTools, Stepper, Swatches } from "./controls";
import { SavedEffects, StudioCards, type Pick } from "./Studio";
import { paint, paintLayer, type Brush } from "./paint";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { Checkbox } from "@/components/motion/checkbox";
import { HoldActionButton } from "@/components/motion/hold-action-button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger } from "@/components/motion/combobox";
import { Table, type TableColumn } from "@/components/motion/table";

const DEV = isDevMode();
const SECTIONS: { id: Section; pt: string; en: string }[] = [
  { id: "screen", pt: "Tela", en: "Screen" },
  { id: "keys", pt: "Teclas", en: "Keys" },
  { id: "light", pt: "Iluminação", en: "Lighting" },
  { id: "system", pt: "Sistema", en: "System" },
  ...(DEV ? [{ id: "log" as const, pt: "Log", en: "Log" }] : []),
];
const ALL_POSITIONS = [...X85_KEYS.map((k) => k.pos), ...X85_VIRTUAL.map((v) => v.pos)];
const UDEV = `curl -fsSL ${SITE}/udev.sh | sudo sh`;

type Layer = "base" | "fn";

export function Configurator({ section }: { section: Section }) {
  const { kb, identity, snapshot, loading, connect, connecting, error, dryRun, setDryRun } = useDevice();
  const lang = useLang();
  const tr = useTr();
  const job = useUploadJob();
  const storing = useStudioJob();
  // How storing a studio effect ended, shown on whichever tab is in front.
  const storedStatus = useMemo(
    () =>
      storing.status === "success"
        ? { ok: true, text: tr("Efeito gravado no teclado", "Effect stored on the keyboard") }
        : storing.status === "error"
          ? { ok: false, text: storing.error ?? tr("O teclado não confirmou. Tente de novo.", "The keyboard did not confirm. Try again.") }
          : null,
    [storing.status, storing.error, lang],
  );
  const go = (id: Section) => navigate(pathOf({ lang, page: "app", section: id }), true);
  const tftPx = useRef(150);
  const ed = useScreenEditor(() => tftPx.current, () => section !== "screen" && go("screen"));
  const [layer, setLayer] = useState<Layer>("base");
  const [selected, setSelected] = useState<number | null>(null);
  // Light drafts live here so the board can preview them before they are applied.
  const [light, setLight] = useState<LightSetting | undefined>(snapshot.light);
  const [designs, setDesigns] = useState<Rgb[][] | undefined>(snapshot.perKey);
  const [brush, setBrush] = useState<Brush>({ tool: "brush", rgb: { r: 255, g: 0, b: 0 } });
  useEffect(() => setLight(snapshot.light), [snapshot.light]);
  useEffect(() => setDesigns(snapshot.perKey), [snapshot.perKey]);
  const studio = useStudio(brush, setBrush);
  // Esc deselects the key, unless it is closing an open list, menu or picker first. Listened
  // in the capture phase, so the popup is still marked open when this runs.
  useEffect(() => {
    if (section !== "keys" || selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[aria-expanded="true"]')) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [section, selected]);
  const uploadPct = job.status === "uploading" ? Math.round(job.progress * 100) : null;
  const storingPct = storing.status === "uploading" ? Math.round(storing.progress * 100) : null;
  useEffect(() => {
    // While the screen uploads or an effect is stored, the tab shows how far it got, even with
    // another tab in front.
    document.title =
      uploadPct !== null
        ? `${uploadPct}% · ${tr("Enviando para a tela", "Sending to the screen")}`
        : storingPct !== null
          ? `${storingPct}% · ${tr("Gravando o efeito", "Storing the effect")}`
          : `${PRODUCT} · ${tr(SECTIONS.find((s) => s.id === section)?.pt ?? "", SECTIONS.find((s) => s.id === section)?.en ?? "")}`;
  });

  // Painting looks straight down, with the legends, so every key is as easy to reach.
  const painting = section === "light" && (light?.mode === PER_KEY_MODE || (light?.mode === ANIMATION_MODE && studio.pick !== null));
  const framing: Framing = section === "log" ? "keys" : painting ? "paint" : section;
  const factory = layer === "base" ? FACTORY_BASE : FACTORY_FN_WIN;
  const map = snapshot[layer === "base" ? "keymap" : "fnKeymap"] ?? null;
  const showMap = map ?? FACTORY_BASE;
  const edited = (pos: number) => map !== null && !sameValue(factory[pos], map[pos]);
  const faceKey = `${lang}:${layer}:${map ? map.map((v) => v.join(",")).join(";") : "factory"}`;
  const lighting = section === "light";
  // Several pointer moves can land before a render, so strokes build on the latest draft.
  const paintAt = (design: number, pos: number) => {
    if (brush.tool === "eyedropper") {
      const picked = designs && paint(designs[design], pos, brush, LED_SLOTS).picked;
      if (picked) setBrush({ tool: "brush", rgb: picked });
      return;
    }
    setDesigns((ds) => {
      const next = ds && paint(ds[design], pos, brush, LED_SLOTS).design;
      return next ? ds.map((d, i) => (i === design ? next : d)) : ds;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0b0c] text-neutral-100 lg:h-screen" onDragOver={(e) => e.preventDefault()} onDrop={ed.onDrop}>
      <header className="z-30 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-white/[0.05] px-5">
        <a
          href={pathOf({ lang, page: "landing", section: "screen" })}
          onClick={(e) => {
            e.preventDefault();
            navigate(pathOf({ lang, page: "landing", section: "screen" }), { fade: true });
          }}
          className="flex items-center gap-2.5 justify-self-start"
          title={tr("Página inicial", "Home page")}
        >
          <Logo className="size-7" />
          <span className="hidden font-semibold sm:inline">{PRODUCT}</span>
        </a>
        <Tabs value={section} onValueChange={(v) => go(v as Section)} variant="segment">
          <TabsList className="bg-white/[0.05]">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {tr(s.pt, s.en)}
                {s.id === "screen" && uploadPct !== null && <span className="num ml-1.5 text-data">{uploadPct}%</span>}
                {s.id === "light" && storingPct !== null && <span className="num ml-1.5 text-data">{storingPct}%</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center justify-end gap-4 text-xs text-neutral-400">
          {DEV && <Switch checked={dryRun} onCheckedChange={setDryRun} label={tr("Simulação", "Dry run")} ariaLabel={tr("Modo simulação", "Dry run")} />}
          <LangSwitch section={section} />
          {kb ? (
            <span className="num hidden animate-fade-in items-center gap-1.5 md:flex">
              <span className={cn("size-1.5 rounded-full", kb.t.isWired ? "bg-positive" : "bg-amber-400")} />
              {kb.t.isWired ? tr("Cabo USB", "USB cable") : "Dongle 2.4G"} · ID {identity?.deviceId}
            </span>
          ) : (
            <button type="button" onClick={connect} disabled={connecting} className="flex items-center gap-1.5 text-neutral-100 hover:text-white">
              <Usb className="size-3.5" /> {connecting ? tr("Conectando…", "Connecting…") : tr("Conectar teclado", "Connect keyboard")}
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          // basis-0 + overflow-hidden: the canvas can never push the stage bigger than the dock leaves.
          className="relative h-[46vh] min-h-[300px] shrink-0 touch-none overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1 lg:basis-0"
          style={{ cursor: section === "screen" && ed.source ? "grab" : section === "keys" ? "pointer" : "default" }}
          title={section === "screen" && ed.source ? tr("Arraste para posicionar, role para dar zoom", "Drag to position, scroll to zoom") : undefined}
          {...(section === "screen" ? ed.handlers : {})}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_48%,#1a1c20,transparent_70%)]" aria-hidden />
          <canvas
            ref={ed.glow}
            width={32}
            height={32}
            className={cn("pointer-events-none absolute left-1/2 top-[52%] h-64 w-80 -translate-x-1/2 -translate-y-1/2 blur-[70px] transition-opacity duration-1000", section === "screen" ? "opacity-50" : "opacity-0")}
            aria-hidden
          />
          <Board3D
            className="absolute inset-0"
            screen={ed.screen}
            framing={framing}
            face={(pos) =>
              layer === "fn" && isEmpty(showMap[pos])
                ? { label: keyShortName(lang, FACTORY_BASE[pos] ?? [0, 0, 0, 0]), dim: true }
                : { label: keyShortName(lang, showMap[pos] ?? [0, 0, 0, 0]), edited: edited(pos) }
            }
            faceKey={faceKey}
            light={lighting ? light : undefined}
            perKey={lighting && light?.mode === PER_KEY_MODE ? designs?.[light.option] : undefined}
            studio={lighting && light?.mode === ANIMATION_MODE && !studio.unknown ? studio.preview : undefined}
            onPaint={
              lighting && light?.mode === PER_KEY_MODE && designs
                ? (pos) => paintAt(light.option, pos)
                : lighting && light?.mode === ANIMATION_MODE && studio.pick
                  ? studio.pickAt
                  : undefined
            }
            ready={!!kb && !loading}
            wakeLight={snapshot.light}
            tftPx={tftPx}
            selected={section === "keys" ? selected : null}
            legends={section === "keys" || section === "log" || painting}
            onKey={(pos) => section === "keys" && setSelected(pos)}
            fallback={<p className="grid size-full place-items-center text-sm text-neutral-500">{tr("Este computador não tem WebGL para o teclado em 3D.", "This computer has no WebGL for the 3D keyboard.")}</p>}
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_30%_42%_at_50%_50%,transparent_35%,#0a0b0c_100%)] transition-opacity duration-1000",
              section === "screen" ? "opacity-100" : "opacity-0",
            )}
            aria-hidden
          />
        </div>

        <Glide>
          <section aria-label={tr("Controles", "Controls")} className="border-t border-white/[0.05] px-4 pb-4 pt-3">
            <Toast status={storedStatus} />
            {kb && error && <ConnectNotice error={error} className="mx-auto mb-3 max-w-[1320px]" />}
            {dryRun && <p className="mb-2 text-xs text-amber-400">{tr("Modo simulação: nada é gravado no teclado; os pacotes vão para o Log.", "Dry run: nothing is written to the keyboard; packets go to the Log.")}</p>}
            {section === "log" ? (
              <LogSection />
            ) : !kb ? (
              <div key="off" className="animate-fade-in">
                <ConnectDock />
              </div>
            ) : (
              <div key="on" className="animate-dock-in">
                <div key={section} className="animate-fade-in">
                  {section === "screen" && <ScreenSection ed={ed} />}
                  {section === "keys" && <KeysSection layer={layer} setLayer={setLayer} selected={selected} setSelected={setSelected} />}
                  {section === "light" && <LightSection light={light} setLight={setLight} designs={designs} setDesigns={setDesigns} brush={brush} setBrush={setBrush} studio={studio} />}
                  {section === "system" && <SystemSection />}
                </div>
              </div>
            )}
          </section>
        </Glide>
      </div>
    </div>
  );
}

/** Eases the dock to its new height, so the board above resizes smoothly instead of jumping. */
function Glide({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const [moving, setMoving] = useState(false);
  useLayoutEffect(() => {
    const el = inner.current!;
    const ro = new ResizeObserver(() =>
      setHeight((h) => {
        if (h !== undefined && h !== el.offsetHeight) setMoving(true);
        return el.offsetHeight;
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      className={cn("shrink-0 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", moving && "overflow-hidden")}
      style={{ height }}
      onTransitionEnd={(e) => e.target === e.currentTarget && setMoving(false)}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}

function LangSwitch({ section }: { section: Section }) {
  const lang = useLang();
  return (
    <span className="flex items-center rounded-lg bg-white/[0.05] p-0.5" role="group" aria-label="Idioma / Language">
      {(["pt", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => lang !== l && navigate(pathOf({ lang: l, page: "app", section }), { replace: true, fade: true, keepScroll: true })}
          className={cn("h-7 rounded-md px-2 text-xs uppercase", lang === l ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white")}
        >
          {l}
        </button>
      ))}
    </span>
  );
}

/* ---------- Building blocks ---------- */

function BigButton({ primary, disabled, onClick, progress, children }: { primary?: boolean; disabled?: boolean; onClick: () => void; progress?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex h-12 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm transition-colors",
        primary
          ? "bg-neutral-100 font-medium text-neutral-950 hover:bg-white disabled:bg-[#1a1b1d] disabled:text-neutral-500"
          : "border border-white/[0.07] bg-[#1a1b1d] hover:bg-[#202124] disabled:text-neutral-500",
      )}
    >
      {progress !== undefined && <span className="absolute inset-y-0 left-0 bg-data/30 transition-[width]" style={{ width: `${progress * 100}%` }} />}
      <span className="relative flex min-w-0 items-center gap-2">{children}</span>
    </button>
  );
}

function Option<T extends string | number>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-neutral-400">{props.label}</span>
      <Select value={String(props.value)} onValueChange={(v) => props.onChange(props.options.find((o) => String(o.value) === v)!.value)}>
        <SelectTrigger aria-label={props.label} className="h-9 w-48 border-white/[0.07] bg-[#1a1b1d]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((o) => (
            <SelectItem key={String(o.value)} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Status({ status }: { status: { ok: boolean; text: string } | null }) {
  if (!status) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", status.ok ? "text-positive" : "text-red-400")}>
      {status.ok ? <Check className="size-3.5 shrink-0" /> : <TriangleAlert className="size-3.5 shrink-0" />}
      {status.text}
    </p>
  );
}

/** The same message floating over the page, so it never pushes the layout around. */
function Toast({ status }: { status: { ok: boolean; text: string } | null }) {
  const [shown, setShown] = useState(status);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    setShown(status);
    setLeaving(false);
    if (!status) return;
    const stay = status.ok ? 2600 : 6000;
    const fade = setTimeout(() => setLeaving(true), stay);
    const hide = setTimeout(() => setShown(null), stay + 280);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [status]);
  if (!shown) return null;
  return createPortal(
    <div
      role="status"
      className={cn(
        "fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-white/[0.08] bg-[#17181a]/95 px-4 py-2 shadow-lg shadow-black/40 backdrop-blur",
        leaving ? "animate-toast-out" : "animate-toast-in",
      )}
    >
      <Status status={shown} />
    </div>,
    document.body,
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 disabled:opacity-40">
      {children}
    </button>
  );
}

function CopyCommand({ command }: { command: string }) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/50 py-1 pl-3 pr-1 ring-1 ring-white/[0.06]">
      <code className="scrollbar-hide min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs leading-7 text-neutral-200">{command}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white"
      >
        {copied ? <Check className="size-3.5 text-data" /> : <Copy className="size-3.5" />}
        {copied ? tr("Copiado", "Copied") : tr("Copiar", "Copy")}
      </button>
    </div>
  );
}

/* ---------- Not connected ---------- */

function ConnectNotice({ error, className }: { error: ConnectError; className?: string }) {
  const lang = useLang();
  const { title, hint } = describeConnectError(error, lang);
  const warning = error.kind === "not-x85" || error.kind === "no-access" || error.kind === "no-cable" || error.kind === "dongle";
  return (
    <div role="alert" className={cn("flex items-start gap-2.5 text-sm", className)}>
      <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", warning ? "text-amber-400" : "text-red-400")} />
      <p className="min-w-0">
        <span className={warning ? "text-amber-200" : "text-red-200"}>{title}</span> <span className="text-neutral-400">{hint}</span>
      </p>
    </div>
  );
}

function ConnectDock() {
  const { connect, connecting, error } = useDevice();
  const tr = useTr();
  const inApp = navigator.userAgent.includes("Electron");
  const noAccess = error?.kind === "no-access";
  const noCable = error?.kind === "no-cable" || error?.kind === "dongle";
  return (
    <Dock cols="md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card
        title={tr("1. Cabo USB", "1. USB cable")}
        aside={<Cable className={cn("size-4", noCable ? "text-amber-400" : "text-neutral-500")} />}
        className={cn(noCable && "border-amber-400/40")}
      >
        <p className="text-sm text-neutral-400">
          {tr(
            "Ligue o X85 Pro pelo cabo. A tela só aceita imagens pelo cabo, e pelo dongle 2.4G este app ainda não configura o teclado.",
            "Plug the X85 Pro in with the cable. The screen only takes images over USB, and over the 2.4G dongle this app cannot configure the keyboard yet.",
          )}
        </p>
        {noCable && error && <ConnectNotice error={error} />}
      </Card>
      <Card
        title={tr("2. Acesso no Linux, uma vez", "2. Linux access, once")}
        aside={<ShieldCheck className={cn("size-4", noAccess ? "text-amber-400" : "text-neutral-500")} />}
        className={cn(noAccess && "border-amber-400/40")}
      >
        <p className="text-sm text-neutral-400">
          {tr("Sem esta regra, só o root abre o teclado. Rode no terminal e reconecte o cabo:", "Without this rule only root can open the keyboard. Run it in a terminal and replug the cable:")}
        </p>
        <CopyCommand command={UDEV} />
        {noAccess && error && <ConnectNotice error={error} />}
      </Card>
      <Card title={tr("3. Conectar", "3. Connect")} aside={<Usb className="size-4 text-neutral-500" />}>
        <p className="text-sm text-neutral-400">
          {inApp
            ? tr("O app encontra o teclado sozinho.", "The app finds the keyboard by itself.")
            : tr("Na janela do navegador, escolha Gaming Keyboard.", "In the browser's window, pick Gaming Keyboard.")}
        </p>
        <div className="mt-auto grid">
          <BigButton primary onClick={connect} disabled={connecting}>
            <Usb className="size-4" /> {connecting ? tr("Conectando…", "Connecting…") : tr("Conectar teclado", "Connect keyboard")}
          </BigButton>
        </div>
        {error && !noAccess && !noCable && error.kind !== "not-x85" && <ConnectNotice error={error} />}
      </Card>
    </Dock>
  );
}

/* ---------- Screen ---------- */

function ScreenSection({ ed }: { ed: ScreenEditor }) {
  const tr = useTr();
  const picker = useRef<HTMLInputElement>(null);
  const { source, view, setView, job } = ed;
  return (
    <Dock cols="md:grid-cols-2">
      <Card title={tr("Enquadramento", "Framing")} aside={<IconButton label={tr("Centralizar a imagem", "Center the image")} disabled={!source} onClick={ed.center}><Crosshair className="size-4" /></IconButton>}>
        <Stepper label="Zoom" value={toSlider(view.zoom)} display={`${ed.zoomPct}%`} min={0} max={100} onChange={(s) => ed.setZoom(toZoom(s))} disabled={!source} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={view.fit} onValueChange={(fit) => setView({ ...DEFAULT_VIEW, fit: fit as Fit })} variant="segment">
            <TabsList className="bg-white/[0.04]">
              <TabsTrigger value="cover" disabled={!source}>{tr("Preencher", "Fill")}</TabsTrigger>
              <TabsTrigger value="contain" disabled={!source}>{tr("Inteira", "Fit")}</TabsTrigger>
              <TabsTrigger value="stretch" disabled={!source}>{tr("Esticar", "Stretch")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {ed.animated && (
            <Select value={String(ed.delay)} onValueChange={(v) => ed.setDelay(Number(v))}>
              <SelectTrigger aria-label={tr("Intervalo entre quadros", "Frame interval")} className="h-9 w-auto gap-2 border-white/[0.07] bg-transparent text-sm">
                <Timer className="size-4 text-neutral-400" />
                <span className="num">{clampDelay(ed.delay)} ms</span>
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...DELAYS, clampDelay(ed.delay)])].sort((a, b) => a - b).map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} ms</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>
      <Card
        title={tr("Imagem", "Image")}
        aside={
          <IconButton label={ed.clock === "done" ? tr("Relógio acertado", "Clock set") : tr("Acertar o relógio do teclado", "Set the keyboard's clock")} disabled={!ed.kb} onClick={ed.syncClock}>
            {ed.clock === "done" ? <Check className="size-4 text-positive" /> : <Clock className="size-4" />}
          </IconButton>
        }
      >
        <p className="num truncate text-sm">
          {ed.file ? ed.file.name : tr("Nenhuma · arraste ou cole (Ctrl+V)", "None · drop or paste (Ctrl+V)")}
          {source && <span className="text-neutral-500"> · {source.width} × {source.height}{ed.animated ? ` · ${source.frames.length} ${tr("quadros", "frames")}` : ""}</span>}
        </p>
        {ed.loadError && <p className="text-xs text-red-400">{ed.loadError}</p>}
        <div className="mt-auto grid grid-cols-2 gap-2">
          <BigButton onClick={() => picker.current?.click()}>
            <ImagePlus className="size-4 shrink-0 text-neutral-400" />
            <span className="truncate">{ed.file ? tr("Trocar imagem", "Change image") : tr("Escolher imagem", "Choose image")}</span>
          </BigButton>
          <BigButton primary disabled={!ed.canSend} onClick={ed.send} progress={ed.uploading ? job.progress : undefined}>
            {job.status === "success" ? <Check className="size-4" /> : job.status === "error" ? <TriangleAlert className="size-4" /> : <Upload className="size-4" />}
            <span className="num truncate">{ed.sendLabel}</span>
          </BigButton>
        </div>
        {ed.kb && !ed.kb.t.isWired && <p className="text-xs text-amber-400">{tr("Pelo dongle a tela não recebe imagens; use o cabo.", "Over the dongle the screen takes no images; use the cable.")}</p>}
        <input ref={picker} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onChange={(e) => e.target.files?.[0] && ed.setFile(e.target.files[0])} />
      </Card>
    </Dock>
  );
}

/* ---------- Keys ---------- */

function KeysSection(props: { layer: Layer; setLayer: (l: Layer) => void; selected: number | null; setSelected: (p: number | null) => void }) {
  const { kb, snapshot, patch } = useDevice();
  const { busy, status, run } = useAction();
  const lang = useLang();
  const tr = useTr();
  const [mods, setMods] = useState(0);
  const { layer, selected } = props;
  const factory = layer === "base" ? FACTORY_BASE : FACTORY_FN_WIN;
  const snapKey = layer === "base" ? "keymap" : "fnKeymap";
  const map = snapshot[snapKey] ?? null;
  if (!kb) return null;

  const edited = (pos: number) => map !== null && !sameValue(factory[pos], map[pos]);
  const editedPositions = map ? ALL_POSITIONS.filter(edited) : [];
  const write = (pos: number, v: KeyValue) => (layer === "base" ? kb.setKey(pos, v) : kb.setFnKey(pos, v));
  const remember = (changes: [number, KeyValue][]) => {
    if (!map || kb.t.dryRun) return;
    const next = map.slice();
    for (const [pos, v] of changes) next[pos] = v;
    patch({ [snapKey]: next });
  };
  const name = (pos: number) => {
    const v = X85_VIRTUAL.find((x) => x.pos === pos);
    return v ? labelIn(lang, v.label) : `${tr("Tecla", "Key")} ${keyName(lang, FACTORY_BASE[pos] ?? [0, 0, 0, 0])}`;
  };
  const assign = (value: KeyValue) => {
    if (selected === null) return;
    const pos = selected;
    run(tr("Tecla alterada", "Key changed"), async () => {
      const ok = await write(pos, value);
      if (ok) remember([[pos, value]]);
      return ok;
    });
  };
  const restoreAll = () =>
    run(editedPositions.length === 1 ? tr("Tecla restaurada", "Key restored") : tr(`${editedPositions.length} teclas restauradas`, `${editedPositions.length} keys restored`), async () => {
      const done: [number, KeyValue][] = [];
      try {
        for (const pos of editedPositions) {
          if (!(await write(pos, factory[pos]))) return false;
          done.push([pos, factory[pos]]);
        }
        return true;
      } finally {
        remember(done);
      }
    });

  return (
    <Dock cols="md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card title={tr("Camada", "Layer")}>
        <Tabs value={layer} onValueChange={(v) => props.setLayer(v as Layer)} variant="segment">
          <TabsList className="bg-white/[0.04]">
            <TabsTrigger value="base">Normal</TabsTrigger>
            <TabsTrigger value="fn">{tr("Segurando Fn", "Holding Fn")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {layer === "fn" && <p className="text-xs text-neutral-500">{tr("Enquanto você segura Fn. As apagadas não fazem nada.", "While you hold Fn. The faint ones do nothing.")}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 text-sm">
          <span className={cn("num", editedPositions.length ? "text-amber-400" : "text-neutral-400")}>
            {editedPositions.length ? tr(`${editedPositions.length} trocada(s) por você`, `${editedPositions.length} changed by you`) : tr("Tudo no padrão de fábrica", "All at factory defaults")}
          </span>
          {editedPositions.length > 0 && (
            <button type="button" disabled={busy} onClick={restoreAll} className="flex shrink-0 items-center gap-1.5 text-neutral-300 hover:text-white">
              <RotateCcw className="size-3.5" /> {tr("Restaurar", "Restore")}
            </button>
          )}
        </div>
      </Card>
      <Card
        title={selected === null ? tr("Tecla", "Key") : name(selected)}
        aside={
          selected !== null &&
          map &&
          edited(selected) && (
            <button type="button" disabled={busy} onClick={() => assign(factory[selected])} className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white">
              <RotateCcw className="size-3.5" /> {tr("Voltar a", "Back to")} {keyName(lang, factory[selected])}
            </button>
          )
        }
      >
        {selected === null || !map ? (
          <p className="text-sm text-neutral-500">{tr("Clique numa tecla do teclado acima para escolher o que ela faz.", "Click a key on the keyboard above to choose what it does.")}</p>
        ) : (
          <>
            <p className="text-[28px] font-light leading-none tracking-[-0.02em]">
              {layer === "fn" && isEmpty(map[selected]) ? <span className="text-neutral-500">{tr("Nada com Fn", "Nothing with Fn")}</span> : keyName(lang, map[selected])}
            </p>
            <Combobox
              key={`${layer}:${selected}`}
              disabled={busy}
              onValueChange={(v) => {
                const [kind, id] = v.split(":");
                assign(kind === "k" ? keyValue(Number(id), mods) : FUNCTIONS[Number(id)].value);
              }}
            >
              <ComboboxTrigger className="rounded-xl border-white/[0.07] bg-[#1a1b1d]">
                <ComboboxInput aria-label={tr("Buscar tecla ou função", "Search a key or function")} placeholder={tr("Trocar por… (busque uma tecla ou função)", "Change to… (search a key or function)")} />
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxList ariaLabel={tr("Teclas e funções", "Keys and functions")}>
                  {KEY_GROUPS.map((g) => (
                    <ComboboxGroup key={g.title}>
                      <ComboboxLabel>{labelIn(lang, g.title)}</ComboboxLabel>
                      {g.usages.map((u) => (
                        <ComboboxItem key={u} value={`k:${u}`} keywords={KEY_KEYWORDS[u]}>
                          {labelIn(lang, HID_NAMES[u] ?? u.toString(16))}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  ))}
                  <ComboboxGroup>
                    <ComboboxLabel>{tr("Funções e mídia", "Functions and media")}</ComboboxLabel>
                    {FUNCTIONS.map((f, i) => (
                      <ComboboxItem key={f.label} value={`f:${i}`}>
                        {labelIn(lang, f.label)}
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                </ComboboxList>
                <ComboboxEmpty>{tr("Nada com esse nome.", "Nothing by that name.")}</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-neutral-500">{tr("Junto com", "Together with")}</span>
              {["Ctrl", "Shift", "Alt", "Super"].map((m, bit) => (
                <Checkbox key={m} label={m} checked={(mods & (1 << bit)) !== 0} onCheckedChange={() => setMods((x) => x ^ (1 << bit))} />
              ))}
            </div>
          </>
        )}
        <Toast status={status} />
      </Card>
      <Card title={tr("Knob e funções sem tecla", "Knob and keyless functions")}>
        <div className="flex flex-col">
          {X85_VIRTUAL.map((vk) => (
            <button
              key={vk.pos}
              type="button"
              onClick={() => props.setSelected(vk.pos)}
              className={cn("flex justify-between gap-3 border-t border-white/[0.05] py-1.5 text-left text-sm first:border-t-0", selected === vk.pos ? "text-data" : "hover:text-white")}
            >
              <span className="truncate text-neutral-400">{labelIn(lang, vk.label)}</span>
              <span className={cn("shrink-0", map && edited(vk.pos) && "text-amber-400", map && isEmpty(map[vk.pos]) && "text-neutral-600")}>
                {map ? (isEmpty(map[vk.pos]) ? tr("nada", "nothing") : keyName(lang, map[vk.pos])) : "…"}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </Dock>
  );
}

/* ---------- Lighting ---------- */

/** The slots that have a light: the keys, not the knob or the screen. */
const LED_SLOTS = X85_KEYS.map((k) => k.pos);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The effect studio's state: the draft, what is on the keyboard, the saved list and the board tools. */
function useStudio(brush: Brush, setBrush: (b: Brush) => void) {
  const [onKeyboard, setOnKeyboard] = useState<StudioEffect | null>(loadOnKeyboard);
  const [draft, setDraftState] = useState<StudioEffect>(() => onKeyboard ?? newEffect());
  // Untouched, a draft that Dorsal did not see stored is not what the keyboard shows.
  const [edited, setEdited] = useState(false);
  const [saved, setSaved] = useState<StudioEffect[]>(loadEffects);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [colourAt, setColourAt] = useState(0);
  const [chosen, setPick] = useState<Pick>(null);
  // A paint layer is painted as soon as it is selected; the other tools are picked by hand.
  const selected = draft.layers.find((l) => l.id === layerId) ?? draft.layers[0];
  const pick: Pick = selected?.kind === "paint" ? "keys" : chosen;
  const { snapshot } = useDevice();
  const plan = useMemo(() => planLoop(draft), [draft]);
  // While painting an area, the board shows the selected layer alone, so its keys stand out.
  const painting = pick === "area" || pick === "remove";
  const preview = useMemo(() => {
    if (!painting) return draft;
    const layer = draft.layers.find((l) => l.id === layerId) ?? draft.layers[0];
    // An effect layer is dark part of the time, so its area is shown in its colour, steady.
    return layer ? { ...draft, layers: [{ ...layer, visible: true, ...(layer.kind === "effect" && { kind: "solid" as const }) }] } : draft;
  }, [draft, layerId, painting]);
  const setDraft = (e: StudioEffect | ((e: StudioEffect) => StudioEffect)) => {
    setDraftState(e);
    setEdited(true);
  };
  /** Replaces the whole draft (another effect opened), dropping the selection and the board tool. */
  const open = (e: StudioEffect) => {
    setDraft(e);
    setLayerId(null);
    setColourAt(0);
    setPick(null);
  };
  return {
    draft,
    /** What the board plays: the draft, or the selected layer alone while painting its area. */
    preview,
    setDraft,
    open,
    onKeyboard,
    plan,
    saved,
    layerId,
    setLayerId,
    colourAt,
    setColourAt,
    pick,
    setPick,
    /** Mode 25 is on the keyboard, but Dorsal does not know which effect it holds. */
    unknown: snapshot.light?.mode === ANIMATION_MODE && !onKeyboard && !edited,
    dirty: !sameJson(draft, onKeyboard),
    // Several pointer moves can land before a render, so strokes build on the latest draft.
    pickAt: (pos: number) => {
      if (!LED_SLOTS.includes(pos)) return;
      if (pick === "keys") {
        if (brush.tool === "eyedropper") {
          const picked = selected?.keys && paintLayer(selected.keys, pos, brush, LED_SLOTS, keyColourAt(draft, pos, 0, plan.timings)).picked;
          if (picked) setBrush({ tool: "brush", rgb: picked });
          return;
        }
        setDraft((e) => ({ ...e, layers: e.layers.map((l) => (l.id !== selected?.id || !l.keys ? l : { ...l, keys: paintLayer(l.keys, pos, brush, LED_SLOTS, { r: 0, g: 0, b: 0 }).keys ?? l.keys })) }));
        return;
      }
      setDraft((e) => {
        const id = e.layers.some((l) => l.id === layerId) ? layerId : e.layers[0]?.id;
        return { ...e, layers: e.layers.map((l) => (l.id !== id ? l : pick === "centre" ? { ...l, centre: pos } : { ...l, area: paintArea(l.area, pos, pick === "area") })) };
      });
      if (pick === "centre") setPick(null);
    },
    save: () => {
      const next = upsertEffect(saved, draft);
      saveEffects(next);
      setSaved(next);
    },
    remove: (id: string) => {
      const next = removeEffect(saved, id);
      saveEffects(next);
      setSaved(next);
    },
    stored: (e: StudioEffect) => {
      saveOnKeyboard(e);
      setOnKeyboard(e);
      setEdited(false);
    },
    discard: () => {
      setDraftState(onKeyboard ?? newEffect());
      setEdited(false);
      setLayerId(null);
      setColourAt(0);
      setPick(null);
    },
  };
}
type Studio = ReturnType<typeof useStudio>;

function LightSection(props: {
  light: LightSetting | undefined;
  setLight: (l: LightSetting) => void;
  designs: Rgb[][] | undefined;
  setDesigns: (d: Rgb[][] | undefined) => void;
  brush: Brush;
  setBrush: (b: Brush) => void;
  studio: Studio;
}) {
  const { kb, snapshot, patch } = useDevice();
  const { busy: applying, status, run } = useAction();
  const tr = useTr();
  const lang = useLang();
  const storing = useStudioJob();
  const progress = storing.status === "uploading" ? storing.progress : null;
  const busy = applying || progress !== null;
  if (!kb) return null;
  const { light, designs, brush, studio } = props;
  if (!light)
    return (
      <Card>
        <p className="text-sm text-neutral-500">{tr("Lendo o teclado…", "Reading the keyboard…")}</p>
      </Card>
    );
  const effect = effectOf(light.mode);
  const perKey = light.mode === PER_KEY_MODE;
  const custom = light.mode === ANIMATION_MODE;
  const lightDirty = !sameJson(light, snapshot.light);
  const dirtyDesigns = (designs ?? []).flatMap((d, i) => (sameJson(d, snapshot.perKey?.[i]) ? [] : [i]));
  const dirty = lightDirty || dirtyDesigns.length > 0 || (custom && studio.dirty);
  const set = (p: Partial<LightSetting>) => props.setLight({ ...light, ...p });
  // Storing runs as a global job, not in this tab: it goes on, and keeps its progress, when
  // another tab is opened meanwhile.
  const storeStudio = async () => {
    const draft = studio.draft;
    studioJob.start(tr("Gravando o efeito", "Storing the effect"));
    try {
      let ok = true;
      for (const i of dirtyDesigns) if (ok) ok = await kb.setPerKey(i, designs![i]);
      if (ok) ok = await applyStudio(kb, draft, light, studioJob.progress, studio.onKeyboard);
      if (ok && !kb.t.dryRun) {
        studio.stored(draft);
        patch({ light: { ...light, mode: ANIMATION_MODE, option: 0 }, perKey: designs });
      }
      studioJob.finish(ok);
    } catch (e) {
      studioJob.finish(false, `${tr("Não deu certo", "It did not work")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const apply = () =>
    custom
      ? storeStudio()
      : run(tr("Iluminação aplicada", "Lighting applied"), async () => {
          // The designs first, then the mode, so a design on show is shown as written.
          for (const i of dirtyDesigns) if (!(await kb.setPerKey(i, designs![i]))) return false;
          if ((lightDirty || (perKey && dirtyDesigns.length)) && !(await kb.setLight(light))) return false;
          if (!kb.t.dryRun) patch({ light, perKey: designs });
          return true;
        });
  const discard = () => {
    if (snapshot.light) props.setLight(snapshot.light);
    props.setDesigns(snapshot.perKey);
    studio.discard();
  };
  const of4 = (n: number) => tr(`${n} de 4`, `${n} of 4`);
  const name = (pair: [string, string]) => (lang === "en" ? pair[1] : pair[0]);

  return (
    <>
      <div className="mx-auto mb-3 flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
        {custom ? (
          <SavedEffects draft={studio.draft} setDraft={studio.open} saved={studio.saved} save={studio.save} remove={studio.remove} />
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {custom && (
            <p className="text-right text-xs text-neutral-500">
              {studio.unknown && tr("O Dorsal não sabe qual efeito está gravado no teclado.", "Dorsal does not know which effect the keyboard holds.")}
              {studio.plan.adjusted && <span className="block text-amber-400/90">{tr("Velocidades ajustadas para o ciclo fechar.", "Speeds adjusted so the loop closes.")}</span>}
            </p>
          )}
          <Toast status={status} />
          <button type="button" disabled={busy || !dirty} onClick={discard} className="h-9 rounded-lg px-3 text-sm text-neutral-300 hover:text-white disabled:text-neutral-600">
            {tr("Descartar", "Discard")}
          </button>
          <button type="button" disabled={busy || !dirty} onClick={apply} className="h-9 rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-950 hover:bg-white disabled:bg-white/[0.06] disabled:text-neutral-500">
            {progress !== null
              ? tr(`Gravando… ${Math.round(progress * 100)}%`, `Storing… ${Math.round(progress * 100)}%`)
              : busy
                ? tr("Aplicando…", "Applying…")
                : tr("Aplicar no teclado", "Apply to keyboard")}
          </button>
        </div>
      </div>
      <Dock cols={custom ? "md:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_minmax(0,1.9fr)]" : "md:grid-cols-2 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1.3fr)_minmax(0,1fr)]"}>
        <Card title={tr("Efeito das teclas", "Key effect")} className="md:col-span-2 xl:col-span-1">
          <EffectGrid value={light.mode} onChange={(mode) => set({ mode, option: optionFor(light.mode, mode, light.option) })} cols={custom ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 xl:grid-cols-5"} />
          {effect?.options && (
            <Tabs value={String(light.option)} onValueChange={(v) => set({ option: Number(v) })} variant="segment">
              <TabsList className="flex-wrap bg-white/[0.04]">
                {effect.options.map((o, i) => (
                  <TabsTrigger key={i} value={String(i)}>
                    {name(o)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {custom && <Stepper label={tr("Brilho", "Brightness")} value={light.brightness} display={of4(light.brightness)} min={0} max={4} onChange={(brightness) => set({ brightness })} />}
        </Card>
        {custom ? (
          <StudioCards
            draft={studio.draft}
            setDraft={studio.setDraft}
            layerId={studio.layerId}
            setLayerId={studio.setLayerId}
            colourAt={studio.colourAt}
            setColourAt={studio.setColourAt}
            pick={studio.pick}
            setPick={studio.setPick}
            plan={studio.plan}
            brush={brush}
            setBrush={props.setBrush}
          />
        ) : perKey ? (
          <Card title={tr("Pintar as teclas", "Paint the keys")}>
            {designs ? (
              <>
                <PaintTools brush={brush} setBrush={props.setBrush} eraser={tr("Borracha", "Eraser")} />
              </>
            ) : (
              <p className="text-xs text-neutral-500">
                {"perKey" in snapshot
                  ? tr("Não deu para ler os desenhos do teclado. Reconecte para tentar de novo.", "Could not read the keyboard's designs. Reconnect to try again.")
                  : tr("Lendo os desenhos…", "Reading the designs…")}
              </p>
            )}
          </Card>
        ) : (
          <Card title={tr("Cor", "Colour")}>
            {effect?.colour === false ? (
              <p className="text-xs text-neutral-500">{light.mode === 0 ? tr("A luz está desligada.", "The light is off.") : tr("Esse efeito usa as próprias cores.", "This effect uses its own colours.")}</p>
            ) : (
              <Swatches value={light} onChange={set} label={tr("das teclas", "for the keys")} />
            )}
          </Card>
        )}
        {!custom && <Card title={tr("Brilho e velocidade", "Brightness and speed")}>
          <Stepper label={tr("Brilho", "Brightness")} value={light.brightness} display={of4(light.brightness)} min={0} max={4} onChange={(brightness) => set({ brightness })} disabled={light.mode === 0} />
          <Stepper label={tr("Velocidade", "Speed")} value={light.speed} display={of4(light.speed)} min={0} max={4} onChange={(speed) => set({ speed })} disabled={!effect?.speed} />
        </Card>}
      </Dock>
    </>
  );
}

function EffectGrid({ value, onChange, cols }: { value: number; onChange: (mode: number) => void; cols: string }) {
  const lang = useLang();
  return (
    <div className={cn("grid gap-1.5", cols)} role="radiogroup">
      {EFFECTS.map((e) => {
        const on = e.id === value;
        return (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(e.id)}
            className={cn("h-8 truncate rounded-lg px-2 text-xs transition-colors", on ? "bg-neutral-100 font-medium text-neutral-950" : "bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] hover:text-white")}
          >
            {lang === "en" ? e.en : e.pt}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- System ---------- */

function SystemSection() {
  const { kb, snapshot, patch, refresh, identity } = useDevice();
  const { busy, status, run } = useAction();
  const tr = useTr();
  const [rate, setRate] = useState(snapshot.reportRate);
  const [debounce, setDebounce] = useState(snapshot.debounce);
  const [sleep, setSleep] = useState(snapshot.sleep);
  const [resetKey, setResetKey] = useState(0);
  const filePicker = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [restoreNote, setRestoreNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setRate(snapshot.reportRate), [snapshot.reportRate]);
  useEffect(() => setDebounce(snapshot.debounce), [snapshot.debounce]);
  useEffect(() => setSleep(snapshot.sleep), [snapshot.sleep]);
  if (!kb) return null;
  const save = (label: string, write: () => Promise<boolean>, p: Parameters<typeof patch>[0]) =>
    run(label, async () => {
      const ok = await write();
      if (ok && !kb.t.dryRun) patch(p);
      return ok;
    });
  const openBackup = async (file: File) => {
    setPlan(null);
    setRestoreNote(null);
    setChecking(true);
    try {
      const next = planRestore(parseBackup(await file.text()), await readCurrent(kb));
      if (isEmptyPlan(next)) setRestoreNote({ ok: true, text: tr("O teclado já está igual ao backup.", "The keyboard already matches the backup.") });
      else setPlan(next);
    } catch (e) {
      const reason = e instanceof BackupError ? e.reason : "not-backup";
      setRestoreNote({
        ok: false,
        text:
          reason === "other-keyboard"
            ? tr("Esse backup é de outro teclado.", "This backup is from another keyboard.")
            : tr("Esse arquivo não é um backup do Dorsal.", "This file is not a Dorsal backup."),
      });
    } finally {
      setChecking(false);
    }
  };
  const changes = (p: RestorePlan) =>
    [
      p.keys.length && (p.keys.length === 1 ? tr("1 tecla", "1 key") : tr(`${p.keys.length} teclas`, `${p.keys.length} keys`)),
      p.fnKeys.length && (p.fnKeys.length === 1 ? tr("1 tecla do Fn", "1 Fn key") : tr(`${p.fnKeys.length} teclas do Fn`, `${p.fnKeys.length} Fn keys`)),
      p.light && tr("luz das teclas", "key lighting"),
      p.perKey.length && (p.perKey.length === 1 ? tr("1 desenho de cores", "1 colour design") : tr(`${p.perKey.length} desenhos de cores`, `${p.perKey.length} colour designs`)),
      (p.reportRate !== undefined || p.debounce !== undefined) && tr("resposta", "response"),
      p.sleep && tr("bateria", "battery"),
      p.studio.length && (p.studio.length === 1 ? tr("1 efeito salvo", "1 saved effect") : tr(`${p.studio.length} efeitos salvos`, `${p.studio.length} saved effects`)),
    ]
      .filter(Boolean)
      .join(", ");
  const restore = () =>
    plan &&
    run(tr("Backup restaurado", "Backup restored"), async () => {
      try {
        // Saved effects live in Dorsal: they join the list, nothing is uploaded.
        if (plan.studio.length) saveEffects(mergeEffects(loadEffects(), plan.studio));
        return await applyRestore(kb, plan);
      } finally {
        setPlan(null);
        if (!kb.t.dryRun) await refresh();
      }
    });
  const responseDirty = rate !== snapshot.reportRate || debounce !== snapshot.debounce;
  const sleepDirty = JSON.stringify(sleep) !== JSON.stringify(snapshot.sleep);
  const minutes = (label: string, field: keyof SleepSetting) =>
    sleep && (
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-neutral-400">{label}</span>
        <span className="flex items-center gap-2 text-neutral-500">
          <input
            type="number"
            min={0}
            max={1080}
            value={Math.round(sleep[field] / 60)}
            onChange={(e) => setSleep({ ...sleep, [field]: Math.max(0, Math.min(1080, Number(e.target.value) || 0)) * 60 })}
            className="num h-8 w-16 rounded-lg border border-white/[0.07] bg-[#1a1b1d] px-2 text-right text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          />
          min
        </span>
      </label>
    );

  // Reads everything fresh, then saves it: a backup must not come from the cache.
  const backup = () =>
    run(tr("Backup salvo", "Backup saved"), async () => {
      const data = {
        createdAt: new Date().toISOString(),
        identity,
        screen: await kb.screenInfo(),
        reportRate: await kb.reportRate(),
        debounce: await kb.debounce(),
        sleep: await kb.sleep(),
        light: await kb.light(),
        perKey: await readPerKey(kb),
        keymap: await kb.keymap(0, 0),
        fnKeymapWin: await kb.fnKeymap(0, 0),
        studio: loadEffects(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `x85-backup-${data.createdAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return true;
    });

  return (
    <Dock cols="md:grid-cols-2 xl:grid-cols-4">
      <Card title={tr("Resposta", "Response")}>
        {rate !== undefined && <Option label={tr("Taxa de polling", "Polling rate")} value={rate} options={REPORT_RATES.map((hz) => ({ value: hz, label: `${hz} Hz` }))} onChange={setRate} />}
        <Stepper label="Debounce" value={debounce ?? 0} display={`${debounce ?? 0} ms`} min={0} max={10} onChange={setDebounce} disabled={debounce === undefined} />
        <div className="mt-auto grid">
          <BigButton
            primary
            disabled={busy || !responseDirty}
            onClick={() =>
              save(tr("Resposta salva", "Response saved"), async () => (rate !== snapshot.reportRate ? await kb.setReportRate(rate!) : true) && (debounce !== snapshot.debounce ? await kb.setDebounce(debounce!) : true), {
                reportRate: rate,
                debounce,
              })
            }
          >
            {tr("Salvar", "Save")}
          </BigButton>
        </div>
      </Card>
      <Card title={tr("Bateria", "Battery")}>
        {!sleep ? (
          <p className="text-sm text-neutral-500">{tr("Lendo o teclado…", "Reading the keyboard…")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {minutes(tr("Luzes apagam no 2.4G", "Lights off on 2.4G"), "rfSeconds")}
              {minutes(tr("Luzes apagam no Bluetooth", "Lights off on Bluetooth"), "btSeconds")}
              {minutes(tr("Desliga o rádio no 2.4G", "Radio off on 2.4G"), "rfDeepSeconds")}
              {minutes(tr("Desliga o rádio no Bluetooth", "Radio off on Bluetooth"), "btDeepSeconds")}
            </div>
            <div className="mt-auto grid">
              <BigButton primary disabled={busy || !sleepDirty} onClick={() => save(tr("Bateria salva", "Battery saved"), () => kb.setSleep(sleep), { sleep })}>
                {tr("Salvar", "Save")}
              </BigButton>
            </div>
          </>
        )}
      </Card>
      <Card title="Backup">
        <p className="text-sm text-neutral-400">
          {tr("Teclas, luz e ajustes num arquivo. O conteúdo das macros fica de fora.", "Keys, lights and settings in one file. Macro contents are not included.")}
        </p>
        <p className="num text-xs text-neutral-500">
          {tr("Firmware", "Firmware")} {identity?.deviceId ?? "—"} · {tr("tela", "screen")} {snapshot.screen ? `${SCREEN_W} × ${SCREEN_H}` : "—"}
        </p>
        {plan ? (
          <p className="text-sm text-neutral-300">
            {tr("Vai mudar", "Will change")}: {changes(plan)}.
          </p>
        ) : (
          restoreNote && <p className={cn("text-xs", restoreNote.ok ? "text-neutral-400" : "text-red-400")}>{restoreNote.text}</p>
        )}
        <input
          ref={filePicker}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void openBackup(f);
          }}
        />
        <div className="mt-auto grid gap-2">
          {plan ? (
            <>
              <BigButton primary disabled={busy} onClick={restore}>
                <Upload className="size-4" /> {busy ? tr("Restaurando…", "Restoring…") : tr("Restaurar", "Restore")}
              </BigButton>
              <BigButton disabled={busy} onClick={() => setPlan(null)}>
                {tr("Cancelar", "Cancel")}
              </BigButton>
            </>
          ) : (
            <>
              <BigButton disabled={busy || checking} onClick={backup}>
                <Download className="size-4" /> {tr("Baixar backup", "Download backup")}
              </BigButton>
              <BigButton disabled={busy || checking} onClick={() => filePicker.current?.click()}>
                <Upload className="size-4" /> {checking ? tr("Comparando…", "Comparing…") : tr("Restaurar backup", "Restore backup")}
              </BigButton>
            </>
          )}
        </div>
      </Card>
      <Card title={tr("Restaurar padrão de fábrica", "Factory reset")}>
        <p className="text-sm text-neutral-400">
          {tr("Apaga teclas trocadas, macros e luz. A imagem da tela fica.", "Clears remapped keys, macros and lighting. The screen image stays.")}
        </p>
        <div className="mt-auto flex flex-col gap-2">
          <HoldActionButton
            key={resetKey}
            type="horizontal"
            holdDuration={2000}
            disabled={busy}
            className="h-12 w-full min-w-0 rounded-xl border border-red-500/40 bg-transparent px-5 text-red-400 [--hold-fill:#dc2626] [--hold-radius:12px]"
            labelClassName="text-sm"
            holdingLabel={<span className="text-white">{tr("Continue segurando…", "Keep holding…")}</span>}
            completeLabel={<span className="text-white">{tr("Restaurando…", "Resetting…")}</span>}
            onHoldComplete={() =>
              run(tr("Teclado restaurado de fábrica", "Keyboard reset to factory settings"), async () => {
                try {
                  const ok = await kb.factoryReset();
                  // The firmware needs a moment before it answers again.
                  if (ok && !kb.t.dryRun) setTimeout(() => void refresh(), 4000);
                  return ok;
                } finally {
                  setResetKey((k) => k + 1);
                }
              })
            }
          >
            {tr("Segure para restaurar", "Hold to reset")}
          </HoldActionButton>
        </div>
      </Card>
      <Toast status={status} />
    </Dock>
  );
}

/* ---------- Log (developer mode) ---------- */

const fmtTime = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour12: false }) + "." + String(t % 1000).padStart(3, "0");
const LOG_COLORS = { tx: "text-neutral-200", rx: "text-positive", dry: "text-amber-400", err: "text-red-400" };
// Most packets are a few command bytes followed by zero padding; the padding is folded away.
const trimZeros = (hex: string) => {
  const bytes = hex.split(" ");
  let end = bytes.length;
  while (end > 1 && bytes[end - 1] === "00") end--;
  if (end === 1 && bytes[0] === "00") return `${bytes.length} × 00`;
  return end === bytes.length ? hex : `${bytes.slice(0, end).join(" ")} … +${bytes.length - end} × 00`;
};

function LogSection() {
  const { log, clearLog } = useDevice();
  const tr = useTr();
  type Row = LogEntry & { id: number };
  const names = { tx: tr("enviado", "sent"), rx: tr("resposta", "reply"), dry: tr("simulado", "dry run"), err: tr("erro", "error") };
  const columns: TableColumn<Row>[] = [
    { key: "time", header: tr("Hora", "Time"), align: "right", width: "120px", sortable: true, sortValue: (e) => e.id, cell: (e) => <span className="num text-neutral-500">{fmtTime(e.time)}</span> },
    { key: "dir", header: tr("Tipo", "Kind"), width: "100px", cell: (e) => <span className={LOG_COLORS[e.dir]}>{names[e.dir]}</span> },
    { key: "hex", header: "Bytes", cell: (e) => <span className="num block truncate font-mono text-[13px]" title={e.hex}>{trimZeros(e.hex)}</span> },
  ];
  const copy = () => navigator.clipboard?.writeText(log.map((e) => `${fmtTime(e.time)} ${e.dir} ${e.hex}`).join("\n"));
  return (
    <Dock cols="grid-cols-1">
      <Card
        title={tr("Pacotes de 64 bytes trocados com o teclado", "64-byte packets exchanged with the keyboard")}
        aside={
          <span className="flex gap-1">
            <IconButton label={tr("Copiar", "Copy")} disabled={!log.length} onClick={copy}>
              <Copy className="size-4" />
            </IconButton>
            <IconButton label={tr("Limpar", "Clear")} disabled={!log.length} onClick={clearLog}>
              <Trash2 className="size-4" />
            </IconButton>
          </span>
        }
      >
        {log.length === 0 ? (
          <p className="text-sm text-neutral-500">{tr("Nenhum pacote ainda.", "No packets yet.")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06] text-[13px]">
            <Table data={log.map((e, id) => ({ ...e, id }))} columns={columns} getRowId={(e) => String(e.id)} defaultSort={{ key: "time", direction: "desc" }} rowHeight={36} height={260} />
          </div>
        )}
      </Card>
    </Dock>
  );
}
