import { describe, expect, it } from "vitest";
import { AREA_SETS, colourAt, effectSeconds, layerLight, paintArea, newEffect, newLayer, sampleGradient, toggleArea, type Layer, type LayerTiming, type StudioEffect } from "../src/studio/effect";
import { FACTORY_BASE } from "../src/layout/x85-factory";
import { X85_KEYS } from "../src/layout/x85";
import type { Rgb } from "../src/protocol/x85";
import { planLoop, renderFrames, studioColours } from "../src/studio/render";
import { applyStudio } from "../src/studio/apply";
import { isEffect, loadEffects, loadOnKeyboard, mergeEffects, removeEffect, saveEffects, saveOnKeyboard, upsertEffect } from "../src/studio/store";
import { afterEach, vi } from "vitest";
import type { LightSetting } from "../src/protocol/x85";

const red: Rgb = { r: 255, g: 0, b: 0 };
const blue: Rgb = { r: 0, g: 0, b: 255 };
const black: Rgb = { r: 0, g: 0, b: 0 };
/** The matrix slot of the key that types this HID usage at the factory. */
const slotOf = (usage: number) => FACTORY_BASE.findIndex((v) => v[0] === 0 && v[2] === usage);
const A = slotOf(0x04);
const ESC = slotOf(0x29);
const near = (a: Rgb, b: Rgb) => Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1;

/** Sign of a pattern's motion along x: for f(x - ct), -(df/dt)(df/dx) has the sign of c. */
function travel(signal: (x: number, t: number) => number, xs: number[]): number {
  let sum = 0;
  for (let i = 0; i < xs.length - 1; i++)
    for (const t of [0.3, 0.9, 1.7]) {
      const ft = signal(xs[i], t + 0.01) - signal(xs[i], t);
      const fx = signal(xs[i + 1], t) - signal(xs[i], t);
      sum += -ft * fx;
    }
  return Math.sign(sum);
}

/** A layer's timing outside any loop: a wave of this period, nothing fading. */
const every = (period: number): LayerTiming => ({ period, loopS: Infinity });
const wave = (more: Partial<Layer>): Layer => ({ ...newLayer("linear"), colours: [red, blue], width: 8, ...more });

describe("studio effect model", () => {
  it("samples the gradient at its stops, between them, and wraps", () => {
    expect(sampleGradient([red, blue], 0, 1)).toEqual(red);
    expect(sampleGradient([red, blue], 0.5, 1)).toEqual(blue);
    expect(near(sampleGradient([red, blue], 0.25, 1), { r: 128, g: 0, b: 128 })).toBe(true);
    expect(near(sampleGradient([red, blue], 0.75, 1), { r: 128, g: 0, b: 128 })).toBe(true);
    expect(sampleGradient([red, blue], 1.5, 1)).toEqual(blue);
  });

  it("hard edges at softness 0", () => {
    expect(sampleGradient([red, blue], 0.24, 0)).toEqual(red);
    expect(sampleGradient([red, blue], 0.26, 0)).toEqual(blue);
  });

  it("one colour is that colour everywhere", () => {
    for (const p of [0, 0.3, 0.99]) for (const s of [0, 1]) expect(sampleGradient([red], p, s)).toEqual(red);
  });

  it("a linear wave travels along its angle", () => {
    // Keys along the number row for x, and down the left edge for y.
    const row = X85_KEYS.filter((k) => k.y === 1).sort((a, b) => a.x - b.x).map((k) => k.pos);
    const col = X85_KEYS.filter((k) => k.x === 0).sort((a, b) => a.y - b.y).map((k) => k.pos);
    const along = (angle: number, slots: number[]) => travel((i, t) => layerLight(wave({ angle }), slots[i], t, every(2))!.c.r, slots.map((_, i) => i));
    expect(along(0, row)).toBe(1);
    expect(along(180, row)).toBe(-1);
    expect(along(90, col)).toBe(1);
  });

  it("a radial wave travels outward, or inward when set", () => {
    const centre = newLayer("radial").centre;
    const c = X85_KEYS.find((k) => k.pos === centre)!;
    const outward = X85_KEYS.filter((k) => k.y === c.y && k.x >= c.x).sort((a, b) => a.x - b.x).map((k) => k.pos);
    const along = (inward: boolean) => travel((i, t) => layerLight({ ...newLayer("radial"), colours: [red, blue], width: 8, inward }, outward[i], t, every(2))!.c.r, outward.map((_, i) => i));
    expect(along(false)).toBe(1);
    expect(along(true)).toBe(-1);
  });

  it("the top layer wins inside its area; below shows outside; hidden does nothing; uncovered is black", () => {
    const letters = AREA_SETS.find((s) => s.id === "letters")!.slots as number[];
    const top: Layer = { ...newLayer("solid"), colours: [red], area: letters };
    const below: Layer = { ...newLayer("solid"), colours: [blue], area: "all" };
    const e = (layers: Layer[]): StudioEffect => ({ ...newEffect(), layers });
    const periods = [every(Infinity), every(Infinity)];
    expect(colourAt(e([top, below]), A, 0, periods)).toEqual(red);
    expect(colourAt(e([top, below]), ESC, 0, periods)).toEqual(blue);
    expect(colourAt(e([{ ...top, visible: false }, below]), A, 0, periods)).toEqual(blue);
    expect(colourAt(e([top]), ESC, 0, [every(Infinity)])).toEqual(black);
  });

  it("a centre that is not a key falls back to the board centre", () => {
    const layer = { ...newLayer("radial"), colours: [red, blue] };
    for (const k of X85_KEYS.slice(0, 20)) expect(layerLight({ ...layer, centre: 127 }, k.pos, 0.4, every(2))).toEqual(layerLight(layer, k.pos, 0.4, every(2)));
  });

  it("painting over all keys starts the area afresh; removing from all keeps the rest", () => {
    expect(paintArea("all", A, true)).toEqual([A]);
    expect(paintArea([ESC], A, true)).toEqual([ESC, A]);
    expect(paintArea("all", A, false)).toHaveLength(X85_KEYS.length - 1);
    expect(paintArea([ESC, A], A, false)).toEqual([ESC]);
  });

  it("area sets and toggling", () => {
    const size = (id: string) => (AREA_SETS.find((s) => s.id === id)!.slots as number[]).length;
    expect([size("letters"), size("numbers"), size("frow"), size("arrows")]).toEqual([26, 10, 12, 4]);
    const without = toggleArea("all", A, false);
    expect(without).toHaveLength(X85_KEYS.length - 1);
    expect(without).not.toContain(A);
    expect(toggleArea([], A, true)).toEqual([A]);
  });
});

describe("keyboard effects as layers", () => {
  const effectLayer = (mode: number, more: Partial<NonNullable<Layer["effect"]>> = {}, colour: Rgb = { r: 255, g: 255, b: 255 }): Layer => {
    const l = newLayer("effect");
    return { ...l, colours: [colour], effect: { ...l.effect!, mode, ...more } };
  };
  const e = (layers: Layer[]): StudioEffect => ({ ...newEffect(), layers });

  it("starts as breathing at speed 2, white, over all keys", () => {
    const l = newLayer("effect");
    expect(l.effect).toEqual({ mode: 2, option: 0, speed: 2, rainbow: false });
    expect(l.colours).toEqual([{ r: 255, g: 255, b: 255 }]);
    expect(l.area).toBe("all");
  });

  it("an effect layer is transparent where dark", () => {
    const breathe = effectLayer(2);
    const P = effectSeconds(breathe)!;
    const timings = [every(P), every(Infinity)];
    const board = e([breathe, { ...newLayer("solid"), colours: [blue] }]);
    expect(colourAt(board, A, 0, timings)).toEqual(blue);
    expect(colourAt(board, A, P / 2, timings)).toEqual({ r: 255, g: 255, b: 255 });
    const half = colourAt(board, A, P / 4, timings);
    expect(Math.abs(half.r - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(half.g - 128)).toBeLessThanOrEqual(2);
    expect(half.b).toBe(255);
  });

  it("an option past the effect's options draws option 0", () => {
    const at = (option: number) => X85_KEYS.map((k) => layerLight(effectLayer(12, { option }), k.pos, 0.3, every(Infinity)));
    expect(at(3)).toEqual(at(0));
  });

  it("old layers draw as before", () => {
    const top = wave({ angle: 30 });
    const below: Layer = { ...newLayer("radial"), colours: [red, blue], width: 8 };
    for (const k of X85_KEYS) expect(colourAt(e([top, below]), k.pos, 0.7, [every(2), every(3)])).toEqual(layerLight(top, k.pos, 0.7, every(2))!.c);
  });
});

const withSpeeds = (...speeds: number[]): StudioEffect => ({ ...newEffect(), layers: speeds.map((speed, i) => wave({ speed, angle: i * 45 })) });

describe("studio loop and frames", () => {
  it("plans a loop inside its bounds", () => {
    for (const speeds of [[1], [10], [3, 7], [1, 10]]) {
      const plan = planLoop(withSpeeds(...speeds));
      expect(plan.loopS).toBeGreaterThanOrEqual(1);
      expect(plan.loopS).toBeLessThanOrEqual(13);
      // Past about 100 frames the keyboard plays leftovers of earlier uploads (seen on 2026-10-25).
      expect(plan.frames).toBeLessThanOrEqual(100);
      expect(plan.delayMs).toBeGreaterThanOrEqual(20);
      expect(plan.delayMs).toBeLessThanOrEqual(130);
      expect(plan.loopS).toBeCloseTo((plan.frames * plan.delayMs) / 1000, 9);
    }
  });

  it("closes the loop with no jump", () => {
    const e = withSpeeds(3, 7);
    const plan = planLoop(e);
    for (const k of X85_KEYS) expect(near(colourAt(e, k.pos, plan.loopS, plan.timings), colourAt(e, k.pos, 0, plan.timings))).toBe(true);
    expect(plan.adjusted).toBe(true);
  });

  it("keeps a speed that already closes", () => {
    expect(planLoop(withSpeeds(3, 6)).adjusted).toBe(false);
  });

  it("a still effect is one frame", () => {
    expect(planLoop({ ...newEffect(), layers: [newLayer("solid")] }).frames).toBe(1);
    expect(planLoop(withSpeeds(0)).frames).toBe(1);
  });

  it("no visible layer uploads one black frame", () => {
    for (const layer of [wave({ visible: false }), wave({ area: [] })]) {
      const e = { ...newEffect(), layers: [layer] };
      const frames = renderFrames(e, planLoop(e));
      expect(frames).toHaveLength(1);
      expect(frames[0]).toHaveLength(128);
      expect(frames[0].every((c) => c.r === 0 && c.g === 0 && c.b === 0)).toBe(true);
    }
  });
});

describe("layer brightness", () => {
  const still = [{ period: Infinity, loopS: 1 }, { period: Infinity, loopS: 1 }];
  it("dims a layer's colour and still covers the layer below; 100% by default", () => {
    expect(newLayer("solid").brightness).toBe(1);
    const top = { ...newLayer("solid"), colours: [{ r: 200, g: 100, b: 50 }], brightness: 0.5 };
    const e = { ...newEffect(), layers: [top, { ...newLayer("solid"), colours: [blue] }] };
    expect(colourAt(e, A, 0, still)).toEqual({ r: 100, g: 50, b: 25 });
    expect(colourAt({ ...e, layers: [{ ...top, brightness: 0 }, e.layers[1]] }, A, 0, still)).toEqual(black);
  });

  it("dims an effect layer's light too", () => {
    const fx = newLayer("effect");
    const lit = { ...fx, effect: { ...fx.effect!, mode: 2 } };
    const P = effectSeconds(lit)!;
    const e = (brightness: number) => ({ ...newEffect(), layers: [{ ...lit, brightness }] });
    expect(colourAt(e(0.5), A, P / 2, [every(P)])).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("is checked when loaded, and older layers without it load at 100%", () => {
    const l = newLayer("solid");
    expect(isEffect({ ...newEffect(), layers: [{ ...l, brightness: 0.3 }] })).toBe(true);
    expect(isEffect({ ...newEffect(), layers: [{ ...l, brightness: 1.5 }] })).toBe(false);
    const { brightness: _, ...old } = l;
    expect(isEffect({ ...newEffect(), layers: [old] })).toBe(true);
    expect(colourAt({ ...newEffect(), layers: [old as Layer] }, A, 0, [every(Infinity)])).toEqual(l.colours[0]);
  });
});

describe("paint layers", () => {
  it("starts unpainted, shows its colours, and lets the layers below show where unpainted", () => {
    const paint = newLayer("paint");
    expect(paint.keys).toHaveLength(128);
    expect(paint.keys!.every((k) => k === null)).toBe(true);
    const keys = paint.keys!.slice();
    keys[A] = red;
    const e = { ...newEffect(), layers: [{ ...paint, keys }, { ...newLayer("solid"), colours: [blue] }] };
    const still = [{ period: Infinity, loopS: 1 }, { period: Infinity, loopS: 1 }];
    expect(colourAt(e, A, 0, still)).toEqual(red);
    expect(colourAt(e, ESC, 0, still)).toEqual(blue);
  });

  it("a paint layer is still: one frame", () => {
    const keys = newLayer("paint").keys!.map(() => red);
    expect(planLoop({ ...newEffect(), layers: [{ ...newLayer("paint"), keys }] }).frames).toBe(1);
  });

  it("paint layers are checked when loaded", () => {
    const paint = newLayer("paint");
    const keys = paint.keys!.slice();
    keys[A] = red;
    expect(isEffect(JSON.parse(JSON.stringify({ ...newEffect(), layers: [{ ...paint, keys }] })))).toBe(true);
    for (const bad of [undefined, keys.slice(0, 10), keys.map((k, i) => (i === 3 ? { r: 300, g: 0, b: 0 } : k))])
      expect(isEffect({ ...newEffect(), layers: [{ ...paint, keys: bad }] })).toBe(false);
  });
});

describe("loops with keyboard effects", () => {
  const effectLayer = (mode: number, speed: number, more: Partial<Layer> = {}): Layer => {
    const l = newLayer("effect");
    return { ...l, effect: { ...l.effect!, mode, speed }, ...more };
  };
  const closes = (e: StudioEffect) => {
    const plan = planLoop(e);
    for (const k of X85_KEYS) expect(near(colourAt(e, k.pos, plan.loopS, plan.timings), colourAt(e, k.pos, 0, plan.timings)), `key ${k.pos}`).toBe(true);
    return plan;
  };

  it("a periodic effect layer closes the loop", () => {
    const plan = closes({ ...newEffect(), layers: [effectLayer(2, 1), wave({ speed: 3 })] });
    expect(plan.loopS).toBeCloseTo(4, 1);
    // Breathing at speed 1 takes 1.84 s: two breaths in the loop, not one slowed down.
    expect(plan.timings[0].period).toBeCloseTo(plan.loopS / 2, 6);
    expect(plan.adjusted).toBe(true);
  });

  it("a random layer gets at least 8 s and closes across the wrap", () => {
    const plan = closes({ ...newEffect(), layers: [effectLayer(18, 2), { ...newLayer("solid"), colours: [blue] }] });
    expect(plan.loopS).toBeGreaterThanOrEqual(8);
    expect(plan.timings[0].period).toBe(Infinity);
  });

  it("the preview shows the frame the keyboard plays, not the moment between frames", () => {
    const fx = newLayer("effect");
    const e = { ...newEffect(), layers: [{ ...fx, effect: { ...fx.effect!, mode: 4 } }, effectLayer(18, 2)] };
    const plan = planLoop(e);
    const frames = renderFrames(e, plan);
    const frame = 7;
    const between = ((frame + 0.6) * plan.delayMs) / 1000;
    expect(studioColours(e, plan, between)).toEqual(frames[frame]);
    expect(studioColours(e, plan, between + plan.loopS)).toEqual(frames[frame]);
  });

  it("a short loop with a random layer does not break", () => {
    const e = { ...newEffect(), layers: [effectLayer(24, 4)] };
    for (let t = 0; t <= 1; t += 0.05)
      for (const k of X85_KEYS) {
        const c = colourAt(e, k.pos, t, [{ period: Infinity, loopS: 1 }]);
        expect([c.r, c.g, c.b].every(Number.isFinite)).toBe(true);
      }
  });

  it("a hidden effect layer is ignored", () => {
    expect(planLoop({ ...newEffect(), layers: [effectLayer(18, 2, { visible: false }), newLayer("solid")] }).frames).toBe(1);
    expect(planLoop({ ...newEffect(), layers: [effectLayer(18, 2, { area: [] }), newLayer("solid")] }).frames).toBe(1);
  });
});

describe("applying a studio effect", () => {
  it("applies: upload, then mode 25; a failed upload leaves the mode", async () => {
    const light: LightSetting = { mode: 4, speed: 2, brightness: 3, option: 1, rainbow: false, rgb: red };
    for (const ok of [true, false]) {
      const set: LightSetting[] = [];
      let uploaded = 0;
      const kb = {
        setAnimation: async (frames: Rgb[][]) => ((uploaded = frames.length), ok),
        setLight: async (l: LightSetting) => (set.push(l), true),
      };
      const e = withSpeeds(3);
      expect(await applyStudio(kb, e, light)).toBe(ok);
      expect(uploaded).toBe(planLoop(e).frames);
      expect(set).toEqual(ok ? [{ ...light, mode: 25, option: 0 }] : []);
    }
  });
});

describe("applying an effect already stored", () => {
  it("skips the upload when the keyboard already holds the effect", async () => {
    const light: LightSetting = { mode: 25, speed: 0, brightness: 4, option: 0, rainbow: false, rgb: red };
    const e = withSpeeds(3);
    let uploads = 0;
    const set: LightSetting[] = [];
    const kb = { setAnimation: async () => (uploads++, true), setLight: async (l: LightSetting) => (set.push(l), true) };
    expect(await applyStudio(kb, e, { ...light, brightness: 1 }, undefined, structuredClone(e))).toBe(true);
    expect(uploads).toBe(0);
    expect(set).toEqual([{ ...light, brightness: 1 }]);
    expect(await applyStudio(kb, e, light, undefined, { ...e, name: "renomeado" })).toBe(true);
    expect(uploads).toBe(0);
    expect(await applyStudio(kb, e, light, undefined, { ...e, layers: [] })).toBe(true);
    expect(uploads).toBe(1);
  });
});

describe("saved studio effects", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("saves, updates and deletes effects", () => {
    vi.stubGlobal("localStorage", memory());
    const e = newEffect("Um");
    saveEffects(upsertEffect(upsertEffect(loadEffects(), e), { ...e, name: "Dois" }));
    expect(loadEffects().map((x) => x.name)).toEqual(["Dois"]);
    saveEffects(removeEffect(loadEffects(), e.id));
    expect(loadEffects()).toEqual([]);
    saveOnKeyboard(e);
    expect(loadOnKeyboard()).toEqual(e);
  });

  it("junk or missing storage reads as empty", () => {
    const cases: unknown[] = [
      undefined,
      { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } },
      { getItem: () => "{", setItem: () => {} },
      { getItem: () => '[{"id":1}]', setItem: () => {} },
    ];
    for (const storage of cases) {
      vi.stubGlobal("localStorage", storage);
      expect(loadEffects()).toEqual([]);
      expect(loadOnKeyboard()).toBeNull();
      expect(() => saveEffects([newEffect()])).not.toThrow();
    }
  });

  it("effect layers are checked, old ones still load", () => {
    const fx = newLayer("effect");
    const good = { ...newEffect(), layers: [fx, ...newEffect().layers] };
    expect(isEffect(JSON.parse(JSON.stringify(good)))).toBe(true);
    for (const bad of [{ ...fx, effect: { ...fx.effect!, mode: 13 } }, { ...fx, effect: { ...fx.effect!, speed: 5 } }, { ...fx, effect: undefined }])
      expect(isEffect({ ...good, layers: [bad] })).toBe(false);
    const before = '{"id":"a1","name":"Antigo","layers":[{"id":"l1","kind":"linear","visible":true,"area":"all","colours":[{"r":255,"g":0,"b":0}],"width":16,"softness":1,"speed":3,"angle":0,"centre":40,"inward":false},{"id":"l2","kind":"radial","visible":true,"area":[1,2],"colours":[{"r":0,"g":0,"b":255}],"width":8,"softness":0,"speed":2,"angle":0,"centre":40,"inward":true},{"id":"l3","kind":"solid","visible":false,"area":"all","colours":[{"r":0,"g":255,"b":0}],"width":16,"softness":1,"speed":3,"angle":0,"centre":40,"inward":false}]}';
    expect(isEffect(JSON.parse(before))).toBe(true);
  });

  it("merges by id, local copy wins", () => {
    const a = newEffect("A");
    const b = newEffect("B");
    const merged = mergeEffects([a], [{ ...a, name: "A de fora" }, b]);
    expect(merged.map((x) => x.name)).toEqual(["A", "B"]);
  });
});
