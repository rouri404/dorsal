// The configurator: the board in 3D as the stage, each section's controls in a dock below.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Cable, Check, Clock, Copy, Crosshair, Download, ImagePlus, Minus, Plus, RotateCcw, ShieldCheck, Timer, Trash2, TriangleAlert, Upload, Usb } from "lucide-react";
import { describeConnectError, useAction, useDevice, type ConnectError } from "../device";
import { BackupError, applyRestore, isEmptyPlan, parseBackup, planRestore, readCurrent, type RestorePlan } from "../backup";
import { FACTORY_BASE, FACTORY_FN_WIN } from "../layout/x85-factory";
import { X85_KEYS, X85_VIRTUAL } from "../layout/x85";
import { FUNCTIONS, HID_NAMES, KEY_GROUPS, KEY_KEYWORDS, isEmpty, keyValue, sameValue, type KeyValue } from "../protocol/keycodes";
import { LIGHT_MODES, REPORT_RATES, SIDE_LIGHT_MODES, type LightSetting, type SleepSetting } from "../protocol/x85";
import { DEFAULT_VIEW, type Fit } from "../screen/load";
import { clampDelay } from "../screen/packets";
import { SCREEN_H, SCREEN_W } from "../screen/send";
import { DELAYS, toSlider, toZoom, useScreenEditor, type ScreenEditor } from "../screen/useScreenEditor";
import { useUploadJob } from "../screen/uploadJob";
import type { LogEntry } from "../hid/transport";
import { useLang, useTr, type Lang } from "../i18n";
import { keyName, keyShortName, labelIn } from "../i18n/labels";
import { navigate, pathOf, type Section } from "../router";
import { isDevMode } from "../devMode";
import { Logo, PRODUCT, SITE } from "../brand";
import { Board3D, type Framing } from "./Board3D";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { RangeSlider } from "@/components/motion/range-slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { Checkbox } from "@/components/motion/checkbox";
import { HoldActionButton } from "@/components/motion/hold-action-button";
import { ColorPicker, ColorPickerArea, ColorPickerContent, ColorPickerHexInput, ColorPickerHue, ColorPickerTrigger } from "@/components/motion/color-picker";
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
// The first is the board's factory white.
const PRESETS = ["#fafffa", "#ff2a2a", "#ff8a00", "#ffe100", "#2aff6a", "#00d5ff", "#2a5bff", "#b02aff", "#ff2ad4"];
const toHex = ({ r, g, b }: LightSetting["rgb"]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const UDEV = `curl -fsSL ${SITE}/udev.sh | sudo sh`;

type Layer = "base" | "fn";

export function Configurator({ section }: { section: Section }) {
  const { kb, identity, snapshot, loading, connect, connecting, error, dryRun, setDryRun } = useDevice();
  const lang = useLang();
  const tr = useTr();
  const job = useUploadJob();
  const go = (id: Section) => navigate(pathOf({ lang, page: "app", section: id }), true);
  const tftPx = useRef(150);
  const ed = useScreenEditor(() => tftPx.current);
  const [layer, setLayer] = useState<Layer>("base");
  const [selected, setSelected] = useState<number | null>(null);
  // Light drafts live here so the board can preview them before they are applied.
  const [light, setLight] = useState<LightSetting | undefined>(snapshot.light);
  const [side, setSide] = useState<LightSetting | undefined>(snapshot.sideLight);
  useEffect(() => setLight(snapshot.light), [snapshot.light]);
  useEffect(() => setSide(snapshot.sideLight), [snapshot.sideLight]);
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
  useEffect(() => {
    document.title = `${PRODUCT} · ${tr(SECTIONS.find((s) => s.id === section)?.pt ?? "", SECTIONS.find((s) => s.id === section)?.en ?? "")}`;
  });

  const framing: Framing = section === "log" ? "keys" : section;
  const factory = layer === "base" ? FACTORY_BASE : FACTORY_FN_WIN;
  const map = snapshot[layer === "base" ? "keymap" : "fnKeymap"] ?? null;
  const showMap = map ?? FACTORY_BASE;
  const edited = (pos: number) => map !== null && !sameValue(factory[pos], map[pos]);
  const faceKey = `${lang}:${layer}:${map ? map.map((v) => v.join(",")).join(";") : "factory"}`;
  const lighting = section === "light";
  const uploadPct = job.status === "uploading" ? Math.round(job.progress * 100) : null;

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
            sideLight={lighting ? side : undefined}
            ready={!!kb && !loading}
            wakeLight={snapshot.light}
            tftPx={tftPx}
            selected={section === "keys" ? selected : null}
            legends={section === "keys" || section === "log"}
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
                  {section === "light" && <LightSection main={light} setMain={setLight} side={side} setSide={setSide} />}
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

function Dock({ cols, children }: { cols: string; children: ReactNode }) {
  return <div className={cn("mx-auto grid max-w-[1320px] items-stretch gap-3", cols)}>{children}</div>;
}

function Card({ title, aside, className, children }: { title?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-[24px] border border-white/[0.07] bg-[#101112] p-5", className)}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-sm text-neutral-400">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

function Round({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
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

function Stepper(props: { label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
  const tr = useTr();
  const step = props.step ?? 1;
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-400">{props.label}</span>
        <span className={cn("num", props.disabled && "text-neutral-600")}>{props.display}</span>
      </div>
      <div className="flex items-center gap-3">
        <Round label={`${tr("Diminuir", "Decrease")} ${props.label.toLowerCase()}`} disabled={props.disabled || props.value <= props.min} onClick={() => props.onChange(clamp(props.value - step))}>
          <Minus className="size-4" />
        </Round>
        <RangeSlider className="flex-1" value={props.value} min={props.min} max={props.max} step={step} showTicks={false} disabled={props.disabled} aria-label={props.label} onValueChange={props.onChange} />
        <Round label={`${tr("Aumentar", "Increase")} ${props.label.toLowerCase()}`} disabled={props.disabled || props.value >= props.max} onClick={() => props.onChange(clamp(props.value + step))}>
          <Plus className="size-4" />
        </Round>
      </div>
    </div>
  );
}

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
          {ed.file ? ed.file.name : tr("Nenhuma escolhida", "None chosen")}
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

function LightSection(props: { main: LightSetting | undefined; setMain: (l: LightSetting) => void; side: LightSetting | undefined; setSide: (l: LightSetting) => void }) {
  const { kb, snapshot, patch } = useDevice();
  const { busy, status, run } = useAction();
  const tr = useTr();
  if (!kb) return null;
  const { main, side } = props;
  if (!main || !side)
    return (
      <Card>
        <p className="text-sm text-neutral-500">{tr("Lendo o teclado…", "Reading the keyboard…")}</p>
      </Card>
    );
  const mainDirty = JSON.stringify(main) !== JSON.stringify(snapshot.light);
  const sideDirty = JSON.stringify(side) !== JSON.stringify(snapshot.sideLight);
  const set = (p: Partial<LightSetting>) => props.setMain({ ...main, ...p });
  const setS = (p: Partial<LightSetting>) => props.setSide({ ...side, ...p });
  const apply = () =>
    run(tr("Iluminação aplicada", "Lighting applied"), async () => {
      if (mainDirty && !(await kb.setLight(main))) return false;
      if (sideDirty && !(await kb.setSideLight(side))) return false;
      if (!kb.t.dryRun) patch({ light: main, sideLight: side });
      return true;
    });
  const discard = () => {
    if (snapshot.light) props.setMain(snapshot.light);
    if (snapshot.sideLight) props.setSide(snapshot.sideLight);
  };
  const dirty = mainDirty || sideDirty;
  const of4 = (n: number) => tr(`${n} de 4`, `${n} of 4`);

  return (
    <>
      <div className="mx-auto mb-3 flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-data">{dirty ? tr("Prévia, não aplicado", "Preview, not applied") : ""}</p>
        <div className="flex items-center gap-2">
          <Status status={status} />
          <button type="button" disabled={busy || !dirty} onClick={discard} className="h-9 rounded-lg px-3 text-sm text-neutral-300 hover:text-white disabled:text-neutral-600">
            {tr("Descartar", "Discard")}
          </button>
          <button type="button" disabled={busy || !dirty} onClick={apply} className="h-9 rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-950 hover:bg-white disabled:bg-white/[0.06] disabled:text-neutral-500">
            {busy ? tr("Aplicando…", "Applying…") : tr("Aplicar no teclado", "Apply to keyboard")}
          </button>
        </div>
      </div>
      <Dock cols="md:grid-cols-2 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card title={tr("Efeito das teclas", "Key effect")} className="md:col-span-2 xl:col-span-1">
          <EffectGrid modes={LIGHT_MODES} value={main.mode} onChange={(mode) => set({ mode })} cols="grid-cols-3 sm:grid-cols-4" />
        </Card>
        <Card title={tr("Cor", "Colour")}>
          <Swatches value={main} onChange={set} label={tr("das teclas", "for the keys")} />
        </Card>
        <Card title={tr("Brilho e velocidade", "Brightness and speed")}>
          <Stepper label={tr("Brilho", "Brightness")} value={main.brightness} display={of4(main.brightness)} min={0} max={4} onChange={(brightness) => set({ brightness })} disabled={main.mode === 0} />
          <Stepper label={tr("Velocidade", "Speed")} value={main.speed} display={of4(main.speed)} min={0} max={4} onChange={(speed) => set({ speed })} disabled={main.mode === 0} />
        </Card>
        <Card title={tr("Luz lateral", "Side light")} aside={<Switch checked={side.mode !== 0} onCheckedChange={(on) => setS({ mode: on ? 1 : 0 })} ariaLabel={tr("Luz lateral", "Side light")} />}>
          {side.mode !== 0 ? (
            <>
              <EffectGrid modes={SIDE_LIGHT_MODES} value={side.mode} onChange={(mode) => setS({ mode })} hideOff cols="grid-cols-2" />
              <Swatches value={side} onChange={setS} label={tr("da luz lateral", "for the side light")} small />
            </>
          ) : (
            <p className="text-xs text-neutral-500">
              {tr("Se nada mudar ao aplicar, o seu modelo não tem essa faixa.", "If nothing changes when you apply, your model does not have this band.")}
            </p>
          )}
        </Card>
      </Dock>
    </>
  );
}

function EffectGrid({ modes, value, onChange, hideOff, cols }: { modes: Record<number, string>; value: number; onChange: (mode: number) => void; hideOff?: boolean; cols: string }) {
  const lang = useLang();
  const entries = Object.entries(modes).filter(([id]) => !(hideOff && id === "0"));
  return (
    <div className={cn("grid gap-1.5", cols)} role="radiogroup">
      {entries.map(([id, name]) => {
        const on = Number(id) === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(Number(id))}
            className={cn("h-8 truncate rounded-lg px-2 text-xs transition-colors", on ? "bg-neutral-100 font-medium text-neutral-950" : "bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] hover:text-white")}
          >
            {labelIn(lang, name)}
          </button>
        );
      })}
    </div>
  );
}

function Swatches({ value, onChange, label, small }: { value: LightSetting; onChange: (p: Partial<LightSetting>) => void; label: string; small?: boolean }) {
  const tr = useTr();
  const hex = toHex(value.rgb);
  const custom = !value.rainbow && !PRESETS.includes(hex);
  const ring = (on: boolean) => cn(small ? "size-6" : "size-8", "shrink-0 rounded-full ring-offset-2 ring-offset-[#101112] transition-shadow", on ? "ring-2 ring-white" : "ring-1 ring-white/10 hover:ring-white/40");
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        aria-label={`${tr("Arco-íris", "Rainbow")} ${label}`}
        aria-pressed={value.rainbow}
        onClick={() => onChange({ rainbow: true })}
        className={cn(ring(value.rainbow), "bg-[conic-gradient(#ff3b3b,#ffb02e,#f5ff3b,#3bff6e,#3bd8ff,#3b5bff,#c63bff,#ff3b3b)]")}
      />
      {PRESETS.map((c) => (
        <button key={c} type="button" aria-label={`${tr("Cor", "Colour")} ${c} ${label}`} aria-pressed={!value.rainbow && hex === c} onClick={() => onChange({ rainbow: false, rgb: fromHex(c) })} className={ring(!value.rainbow && hex === c)} style={{ background: c }} />
      ))}
      <ColorPicker alpha={false} value={hex} onValueChange={(h) => onChange({ rainbow: false, rgb: fromHex(h) })}>
        <ColorPickerTrigger
          aria-label={`${tr("Outra cor", "Other colour")} ${label}`}
          className={cn(ring(custom), "grid place-items-center border-0 bg-transparent p-0 [&>span:first-child]:hidden")}
          style={custom ? { background: hex } : undefined}
        >
          <Plus className="size-4 text-neutral-300" />
        </ColorPickerTrigger>
        {/* The dock sits at the bottom of the window, so the panel opens upwards. */}
        <ColorPickerContent align="end" className="top-auto bottom-full mb-2 mt-0">
          <ColorPickerArea label={tr("Saturação e brilho", "Saturation and brightness")} />
          <ColorPickerHue label={tr("Matiz", "Hue")} />
          <ColorPickerHexInput />
        </ColorPickerContent>
      </ColorPicker>
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
      p.sideLight && tr("luz lateral", "side light"),
      (p.reportRate !== undefined || p.debounce !== undefined) && tr("resposta", "response"),
      p.sleep && tr("bateria", "battery"),
    ]
      .filter(Boolean)
      .join(", ");
  const restore = () =>
    plan &&
    run(tr("Backup restaurado", "Backup restored"), async () => {
      try {
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
        sideLight: await kb.sideLight(),
        keymap: await kb.keymap(0, 0),
        fnKeymapWin: await kb.fnKeymap(0, 0),
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
