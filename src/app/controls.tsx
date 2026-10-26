// Controls shared by the configurator's sections and the effect studio: cards, steppers, colour
// swatches, the paint tools and a command to copy.

import { useState, type ReactNode } from "react";
import { Brush as BrushIcon, Check, Copy, Eraser, Minus, PaintBucket, Pipette, Plus } from "lucide-react";
import { useTr } from "../i18n";
import type { LightSetting } from "../protocol/x85";
import type { Brush, Tool } from "./paint";
import { cn } from "@/lib/utils";
import { RangeSlider } from "@/components/motion/range-slider";
import { ColorPicker, ColorPickerArea, ColorPickerContent, ColorPickerHexInput, ColorPickerHue, ColorPickerTrigger } from "@/components/motion/color-picker";

// The first is the board's factory white.
export const PRESETS = ["#fafffa", "#ff2a2a", "#ff8a00", "#ffe100", "#2aff6a", "#00d5ff", "#2a5bff", "#b02aff", "#ff2ad4"];
export const toHex = ({ r, g, b }: LightSetting["rgb"]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
export const fromHex = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

export function Dock({ cols, children }: { cols: string; children: ReactNode }) {
  return <div className={cn("mx-auto grid max-w-[1320px] items-stretch gap-3", cols)}>{children}</div>;
}

export function Card({ title, aside, className, children }: { title?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
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

export function Stepper(props: { label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
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

export function Swatches({ value, onChange, label, noRainbow }: { value: Pick<LightSetting, "rainbow" | "rgb">; onChange: (p: Partial<LightSetting>) => void; label: string; noRainbow?: boolean }) {
  const tr = useTr();
  const hex = toHex(value.rgb);
  const custom = !value.rainbow && !PRESETS.includes(hex);
  const ring = (on: boolean) => cn("size-8 shrink-0 rounded-full ring-offset-2 ring-offset-[#101112] transition-shadow", on ? "ring-2 ring-white" : "ring-1 ring-white/10 hover:ring-white/40");
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {!noRainbow && (
        <button
          type="button"
          aria-label={`${tr("Arco-íris", "Rainbow")} ${label}`}
          aria-pressed={value.rainbow}
          onClick={() => onChange({ rainbow: true })}
          className={cn(ring(value.rainbow), "bg-[conic-gradient(#ff3b3b,#ffb02e,#f5ff3b,#3bff6e,#3bd8ff,#3b5bff,#c63bff,#ff3b3b)]")}
        />
      )}
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

/** The tools and colour for painting keys, over a board turned to the top view. */
export function PaintTools({ brush, setBrush, eraser }: { brush: Brush; setBrush: (b: Brush) => void; eraser: string }) {
  const tr = useTr();
  const tools: [Tool, ReactNode, string][] = [
    ["brush", <BrushIcon key="b" className="size-4" />, tr("Pincel", "Brush")],
    ["eraser", <Eraser key="e" className="size-4" />, eraser],
    ["fill", <PaintBucket key="f" className="size-4" />, tr("Balde: troca a cor de todas as teclas dessa cor", "Fill: recolours every key of that colour")],
    ["eyedropper", <Pipette key="p" className="size-4" />, tr("Conta-gotas: pega a cor de uma tecla", "Eyedropper: picks a key's colour")],
  ];
  return (
    <>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={tr("Ferramenta", "Tool")}>
        {tools.map(([tool, icon, label]) => (
          <button
            key={tool}
            type="button"
            role="radio"
            aria-checked={brush.tool === tool}
            aria-label={label}
            title={label}
            onClick={() => setBrush({ ...brush, tool })}
            className={cn("grid size-9 place-items-center rounded-lg transition-colors", brush.tool === tool ? "bg-neutral-100 text-neutral-950" : "bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] hover:text-white")}
          >
            {icon}
          </button>
        ))}
      </div>
      <Swatches value={{ rainbow: false, rgb: brush.rgb }} onChange={(p) => p.rgb && setBrush({ tool: brush.tool === "eyedropper" || brush.tool === "eraser" ? "brush" : brush.tool, rgb: p.rgb })} label={tr("do pincel", "for the brush")} noRainbow />
      <p className="text-xs text-neutral-500">{tr("Clique ou arraste sobre as teclas.", "Click or drag over the keys.")}</p>
    </>
  );
}

/** A shell command with a button that copies it. */
export function CopyCommand({ command }: { command: string }) {
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
