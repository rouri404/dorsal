// The effect studio's cards, shown in the lighting tab when the effect is "Personalizado" (mode 25):
// the layers, the selected layer's settings, and the saved effects. The draft lives in the
// configurator, so the board can preview it and paint areas.

import type { ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, Crosshair, Eye, EyeOff, Minus, Plus, Trash2 } from "lucide-react";
import { useLang, useTr } from "../i18n";
import { AREA_SETS, LAYER_EFFECTS, newEffect, newLayer, RANDOM_EFFECTS, type Layer, type LayerKind, type StudioEffect } from "../studio/effect";
import { effectOf, optionFor } from "../protocol/effects";
import type { LoopPlan } from "../studio/render";
import { Card, PaintTools, Stepper, Swatches, toHex } from "./controls";
import type { Brush } from "./paint";
import { cn } from "@/lib/utils";
import { RangeSlider } from "@/components/motion/range-slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";

/** What a stroke on the board does: add keys to the area, remove them, set the centre, or paint a paint layer. */
export type Pick = "area" | "remove" | "centre" | "keys" | null;

const KIND_NAMES: Record<LayerKind, [string, string]> = {
  linear: ["Onda linear", "Linear wave"],
  radial: ["Onda radial", "Radial wave"],
  solid: ["Cor sólida", "Solid colour"],
  paint: ["Pintura", "Paint"],
  effect: ["Efeito do teclado", "Keyboard effect"],
};

const SHORT_NAMES: Record<LayerKind, [string, string]> = {
  linear: ["Linear", "Linear"],
  radial: ["Radial", "Radial"],
  solid: ["Sólida", "Solid"],
  paint: ["Pintura", "Paint"],
  effect: ["Efeito", "Effect"],
};

const pill = (on: boolean) =>
  cn("h-8 rounded-lg px-2.5 text-xs transition-colors disabled:opacity-40", on ? "bg-neutral-100 font-medium text-neutral-950" : "bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] hover:text-white");

function Slide(props: { label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">{props.label}</span>
        <span className="num text-neutral-200">{props.display}</span>
      </div>
      <RangeSlider value={props.value} min={props.min} max={props.max} step={props.step ?? 1} showTicks={false} aria-label={props.label} onValueChange={props.onChange} />
    </div>
  );
}

function Small({ label, onClick, disabled, on, children }: { label: string; onClick: () => void; disabled?: boolean; on?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-30", on ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-white/[0.06] hover:text-white")}
    >
      {children}
    </button>
  );
}

/** The effects that answer typing: in a stored animation the presses are simulated. */
const TYPING_EFFECTS = [5, 8, 14, 19];

/** The settings of a layer that runs one of the keyboard's effects. */
function EffectSettings({ layer, setLayer, brightness }: { layer: Layer; setLayer: (p: Partial<Layer>) => void; brightness: ReactNode }) {
  const tr = useTr();
  const lang = useLang();
  const fx = layer.effect!;
  const set = (p: Partial<typeof fx>) => setLayer({ effect: { ...fx, ...p } });
  const info = effectOf(fx.mode);
  const name = (o: [string, string]) => (lang === "en" ? o[1] : o[0]);
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <Select value={String(fx.mode)} onValueChange={(v) => set({ mode: Number(v), option: optionFor(fx.mode, Number(v), fx.option) })}>
          <SelectTrigger aria-label={tr("Efeito da camada", "Layer effect")} className="h-9 w-full border-white/[0.07] bg-transparent text-sm">
            <SelectValue />
          </SelectTrigger>
          {/* 19 effects are taller than the room above the dock: the list scrolls instead. */}
          <SelectContent className="max-h-72 overflow-y-auto">
            {LAYER_EFFECTS.map((id) => {
              const e = effectOf(id)!;
              return (
                <SelectItem key={id} value={String(id)}>
                  {name([e.pt, e.en])}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {info?.options && (
          <Tabs value={String(fx.option < info.options.length ? fx.option : 0)} onValueChange={(v) => set({ option: Number(v) })} variant="segment">
            <TabsList className="flex-wrap bg-white/[0.04]">
              {info.options.map((o, i) => (
                <TabsTrigger key={i} value={String(i)}>
                  {name(o)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        {TYPING_EFFECTS.includes(fx.mode) && (
          <p className="text-xs text-neutral-500">{tr("Toques simulados: na gravação o teclado não reage ao que você digita.", "Simulated presses: the stored animation does not react to typing.")}</p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {info?.colour !== false && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-neutral-400">{tr("Cor", "Colour")}</span>
            <Swatches value={{ rainbow: fx.rainbow, rgb: layer.colours[0] }} onChange={(p) => setLayer({ effect: { ...fx, rainbow: p.rainbow ?? fx.rainbow }, ...(p.rgb && { colours: [p.rgb] }) })} label="" />
          </div>
        )}
        <Stepper label={tr("Velocidade", "Speed")} value={fx.speed} display={tr(`${fx.speed} de 4`, `${fx.speed} of 4`)} min={0} max={4} onChange={(speed) => set({ speed })} />
        {brightness}
        {RANDOM_EFFECTS.includes(fx.mode) && (
          <p className="text-xs text-neutral-500">{tr("Não se repete: o ciclo dura pelo menos 8 s e o fim se funde com o começo.", "It never repeats: the loop lasts at least 8 s and its end fades into the start.")}</p>
        )}
      </div>
    </div>
  );
}

export function StudioCards(props: {
  draft: StudioEffect;
  setDraft: (e: StudioEffect) => void;
  layerId: string | null;
  setLayerId: (id: string | null) => void;
  /** Which colour of the selected layer the swatches edit. */
  colourAt: number;
  setColourAt: (i: number) => void;
  pick: Pick;
  setPick: (p: Pick) => void;
  plan: LoopPlan;
  brush: Brush;
  setBrush: (b: Brush) => void;
}) {
  const tr = useTr();
  const lang = useLang();
  const { draft, pick } = props;
  /** A layer's colours in the list: a paint layer's first few painted ones, or its gradient's. */
  const dots = (l: Layer) =>
    l.kind === "paint" ? [...new Map((l.keys ?? []).flatMap((c) => (c ? [[toHex(c), c] as const] : []))).values()].slice(0, 4) : l.colours.slice(0, 4);
  /** A layer's name in the list: the effect it runs, or its kind. */
  const rowName = (l: Layer) => {
    const e = l.kind === "effect" && l.effect && effectOf(l.effect.mode);
    return e ? (lang === "en" ? e.en : e.pt) : tr(...KIND_NAMES[l.kind]);
  };
  const layers = draft.layers;
  const selected = layers.find((l) => l.id === props.layerId) ?? layers[0];
  const setLayers = (next: Layer[]) => props.setDraft({ ...draft, layers: next });
  const setLayer = (p: Partial<Layer>) => selected && setLayers(layers.map((l) => (l.id === selected.id ? { ...l, ...p } : l)));
  const move = (i: number, by: number) => {
    const next = [...layers];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setLayers(next);
  };
  const add = (kind: LayerKind) => {
    const layer = newLayer(kind);
    setLayers([layer, ...layers]);
    props.setLayerId(layer.id);
    props.setColourAt(0);
  };
  const remove = (id: string) => {
    setLayers(layers.filter((l) => l.id !== id));
    if (id === selected?.id) props.setLayerId(null);
    props.setPick(null);
  };
  const colourIndex = selected ? Math.min(props.colourAt, selected.colours.length - 1) : 0;
  const level = Math.round((selected?.brightness ?? 1) * 100);
  const brightness = <Slide label={tr("Brilho da camada", "Layer brightness")} value={level} display={`${level}%`} min={0} max={100} onChange={(v) => setLayer({ brightness: v / 100 })} />;
  const areaId = selected && AREA_SETS.find((s) => JSON.stringify(s.slots) === JSON.stringify(selected.area))?.id;

  return (
    <>
      <Card title={tr("Camadas", "Layers")}>
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {layers.map((l, i) => (
            <li key={l.id} className={cn("flex items-center gap-1 rounded-lg pl-1", l.id === selected?.id ? "bg-white/[0.07]" : "hover:bg-white/[0.03]")}>
              <button
                type="button"
                onClick={() => {
                  props.setLayerId(l.id);
                  props.setColourAt(0);
                  props.setPick(null);
                }}
                className={cn("flex h-9 min-w-0 flex-1 items-center gap-2 px-1.5 text-left text-sm", !l.visible && "text-neutral-500")}
              >
                <span className="flex shrink-0 -space-x-1">
                  {dots(l).map((c, n) => (
                    <span key={n} className="size-3 rounded-full ring-1 ring-black/40" style={{ background: toHex(c) }} />
                  ))}
                </span>
                <span className="truncate">{rowName(l)}</span>
              </button>
              <Small label={l.visible ? tr("Esconder", "Hide") : tr("Mostrar", "Show")} onClick={() => setLayers(layers.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)))}>
                {l.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Small>
              <Small label={tr("Subir", "Move up")} disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp className="size-4" />
              </Small>
              <Small label={tr("Descer", "Move down")} disabled={i === layers.length - 1} onClick={() => move(i, 1)}>
                <ChevronDown className="size-4" />
              </Small>
              <Small label={tr("Apagar camada", "Delete layer")} onClick={() => remove(l.id)}>
                <Trash2 className="size-4" />
              </Small>
            </li>
          ))}
          {!layers.length && <li className="py-2 text-xs text-neutral-500">{tr("Sem camadas: o teclado fica apagado.", "No layers: the keyboard stays dark.")}</li>}
        </ul>
        <div className="flex flex-wrap gap-1">
          {(["linear", "radial", "solid", "paint", "effect"] as LayerKind[]).map((kind) => (
            <button key={kind} type="button" title={`${tr("Adicionar", "Add")}: ${tr(...KIND_NAMES[kind])}`} onClick={() => add(kind)} className={cn(pill(false), "flex h-7 items-center gap-1 px-2")}>
              <Plus className="size-3.5" /> {tr(...SHORT_NAMES[kind])}
            </button>
          ))}
        </div>
        {selected && selected.kind !== "paint" && (
          <div className="mt-auto flex flex-col gap-2 border-t border-white/[0.05] pt-3">
            <span className="text-xs text-neutral-400">{tr("Área da camada selecionada", "Area of the selected layer")}</span>
            <div className="flex flex-wrap gap-1">
              {AREA_SETS.map((a) => (
                <button key={a.id} type="button" onClick={() => setLayer({ area: a.slots === "all" ? "all" : [...a.slots] })} className={pill(areaId === a.id)}>
                  {tr(a.pt, a.en)}
                </button>
              ))}
              <button type="button" onClick={() => props.setPick(pick === "area" ? null : "area")} className={pill(pick === "area")}>
                {tr("Pintar", "Paint")}
              </button>
              <button type="button" onClick={() => props.setPick(pick === "remove" ? null : "remove")} className={pill(pick === "remove")}>
                {tr("Tirar", "Remove")}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title={selected ? tr(...KIND_NAMES[selected.kind]) : tr("Camada", "Layer")}>
        {selected?.kind === "paint" ? (
          <div className="flex flex-col gap-4">
            <PaintTools brush={props.brush} setBrush={props.setBrush} eraser={tr("Borracha: deixa a tecla transparente", "Eraser: makes the key see-through")} />
            {brightness}
          </div>
        ) : selected?.kind === "effect" && selected.effect ? (
          <EffectSettings layer={selected} setLayer={setLayer} brightness={brightness} />
        ) : selected ? (
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
              {selected.kind === "linear" && (
                <div className="flex flex-col gap-2">
                  <Slide label={tr("Direção", "Direction")} value={selected.angle} display={`${selected.angle}°`} min={0} max={359} onChange={(angle) => setLayer({ angle })} />
                  <div className="flex gap-1">
                    {(
                      [
                        [0, ArrowRight, tr("Para a direita", "To the right")],
                        [90, ArrowDown, tr("Para a frente", "To the front")],
                        [180, ArrowLeft, tr("Para a esquerda", "To the left")],
                        [270, ArrowUp, tr("Para trás", "To the back")],
                      ] as const
                    ).map(([angle, Icon, label]) => (
                      <Small key={angle} label={label} on={selected.angle === angle} onClick={() => setLayer({ angle })}>
                        <Icon className="size-4" />
                      </Small>
                    ))}
                  </div>
                </div>
              )}
              {selected.kind === "radial" && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => props.setPick(pick === "centre" ? null : "centre")} className={cn(pill(pick === "centre"), "flex items-center gap-1.5")}>
                    <Crosshair className="size-3.5" /> {pick === "centre" ? tr("Clique numa tecla", "Click a key") : tr("Escolher o centro", "Pick the centre")}
                  </button>
                  <button type="button" onClick={() => setLayer({ inward: false })} className={pill(!selected.inward)}>
                    {tr("Para fora", "Outward")}
                  </button>
                  <button type="button" onClick={() => setLayer({ inward: true })} className={pill(selected.inward)}>
                    {tr("Para dentro", "Inward")}
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-neutral-400">{selected.kind === "solid" ? tr("Cor", "Colour") : tr("Cores", "Colours")}</span>
                  {selected.colours.map((c, n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${tr("Editar a cor", "Edit colour")} ${n + 1}`}
                      aria-pressed={n === colourIndex}
                      onClick={() => props.setColourAt(n)}
                      className={cn("size-6 shrink-0 rounded-md ring-offset-2 ring-offset-[#101112]", n === colourIndex ? "ring-2 ring-white" : "ring-1 ring-white/10")}
                      style={{ background: toHex(c) }}
                    />
                  ))}
                  {selected.kind !== "solid" && (
                    <>
                      <Small
                        label={tr("Adicionar cor", "Add colour")}
                        disabled={selected.colours.length >= 8}
                        onClick={() => {
                          setLayer({ colours: [...selected.colours, { ...selected.colours[colourIndex] }] });
                          props.setColourAt(selected.colours.length);
                        }}
                      >
                        <Plus className="size-4" />
                      </Small>
                      <Small label={tr("Remover a cor", "Remove colour")} disabled={selected.colours.length <= 1} onClick={() => setLayer({ colours: selected.colours.filter((_, n) => n !== colourIndex) })}>
                        <Minus className="size-4" />
                      </Small>
                    </>
                  )}
                </div>
                <Swatches
                  value={{ rainbow: false, rgb: selected.colours[colourIndex] }}
                  onChange={(p) => p.rgb && setLayer({ colours: selected.colours.map((c, n) => (n === colourIndex ? p.rgb! : c)) })}
                  label={`${colourIndex + 1}`}
                  noRainbow
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {selected.kind !== "solid" && (
                <>
                  <Slide label={tr("Largura", "Width")} value={selected.width} display={tr(`${selected.width} teclas`, `${selected.width} keys`)} min={2} max={40} onChange={(width) => setLayer({ width })} />
                  <Slide label={tr("Suavidade", "Softness")} value={Math.round(selected.softness * 100)} display={`${Math.round(selected.softness * 100)}%`} min={0} max={100} onChange={(v) => setLayer({ softness: v / 100 })} />
                  <Slide label={tr("Velocidade", "Speed")} value={selected.speed} display={selected.speed ? `${selected.speed}` : tr("parada", "still")} min={0} max={10} onChange={(speed) => setLayer({ speed })} />
                </>
              )}
              {brightness}
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">{tr("Adicione uma camada.", "Add a layer.")}</p>
        )}
      </Card>
    </>
  );
}

/** The saved effects, as a strip above the cards: name the draft, save it, open one, start anew, delete. */
export function SavedEffects(props: { draft: StudioEffect; setDraft: (e: StudioEffect) => void; saved: StudioEffect[]; save: () => void; remove: (id: string) => void }) {
  const tr = useTr();
  const { draft, saved } = props;
  const isSaved = saved.some((e) => e.id === draft.id);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tr("Efeitos salvos", "Saved effects")}>
      <input
        value={draft.name}
        onChange={(e) => props.setDraft({ ...draft, name: e.target.value.slice(0, 40) })}
        aria-label={tr("Nome do efeito", "Effect name")}
        className="h-9 w-44 rounded-lg border border-white/[0.07] bg-[#1a1b1d] px-2.5 text-sm text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      />
      <button type="button" onClick={props.save} className={cn(pill(false), "h-9")}>
        {isSaved ? tr("Atualizar", "Update") : tr("Salvar", "Save")}
      </button>
      <Select value={isSaved ? draft.id : ""} disabled={!saved.length} onValueChange={(id) => { const e = saved.find((x) => x.id === id); if (e) props.setDraft(structuredClone(e)); }}>
        <SelectTrigger aria-label={tr("Abrir um efeito salvo", "Open a saved effect")} className="h-9 w-44 border-white/[0.07] bg-transparent text-sm">
          <SelectValue placeholder={saved.length ? tr("Efeitos salvos", "Saved effects") : tr("Nenhum salvo", "None saved")} />
        </SelectTrigger>
        <SelectContent>
          {saved.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name || tr("Sem nome", "Untitled")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Small label={tr("Novo efeito", "New effect")} onClick={() => props.setDraft(newEffect(tr("Efeito", "Effect")))}>
        <Plus className="size-4" />
      </Small>
      <Small label={tr("Apagar o efeito salvo", "Delete the saved effect")} disabled={!isSaved} onClick={() => props.remove(draft.id)}>
        <Trash2 className="size-4" />
      </Small>
    </div>
  );
}
