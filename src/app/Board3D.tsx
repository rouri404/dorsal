// The X85 Pro in 3D, built from the physical layout in src/layout/x85.ts.

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BOARD_ROWS, BOARD_UNITS, INDICATORS, KNOB_PRESS, KNOB_SLOT, SCREEN_SLOT, X85_KEYS } from "../layout/x85";
import type { LightSetting, Rgb } from "../protocol/x85";
import { ANIMATION_MODE, PER_KEY_MODE } from "../protocol/effects";
import type { StudioEffect } from "../studio/effect";
import { planLoop, studioColours, type LoopPlan } from "../studio/render";
import { effectFor, LIGHT_POINTS, lightAt } from "./lightFx";

export type Framing = "screen" | "keys" | "light" | "paint" | "system";

export interface KeyFace {
  label: string;
  edited?: boolean;
  /** Printed faintly: a key that does nothing in this layer. */
  dim?: boolean;
}

const GAP = 0.08;
const KEY_H = 0.5;
const TOP_SCALE = 0.86;
const ROW_CAP = [0xdcdddf, 0xaeb1b4, 0x6f7277, 0x505358, 0x37393d, 0x222326];
const ROW_INK = ["#33353a", "#2c2e33", "#26282c", "#202226", "#d6d8db", "#cfd1d4"];
const ROW_EDITED = ["#9a5800", "#8a4f00", "#6a3900", "#5a3000", "#f0b44c", "#f0b44c"];
const ROW_SELECTED = ["#0b6f86", "#095f73", "#064c5c", "#05404e", "#5fd0e6", "#5fd0e6"];
const ROW_TILT = [0.13, 0.09, 0.04, 0, -0.05, -0.09];
const ROW_RISE = [0.1, 0.07, 0.035, 0.01, 0, 0.02];
const F_GAP = 0.25;
const DEPTH = BOARD_ROWS + F_GAP;

const at = (x: number, w: number, y: number) => new THREE.Vector3(x + w / 2 - BOARD_UNITS / 2, 0, y + (y > 0 ? F_GAP : 0) + 0.5 - DEPTH / 2);

// `fit` is the scene (width × height, in board units) that must stay whole; the camera
// distance follows from the stage's aspect.
interface Shot {
  target: THREE.Vector3;
  dir: THREE.Vector3;
  fov: number;
  fit: [number, number];
}
/** The screen sits low in the case, near the plate, with the keys standing above it. */
const SCREEN_H = 0.12;
const SCREEN_TOP = at(SCREEN_SLOT.x, 1, SCREEN_SLOT.y).setY(SCREEN_H);
const FRAMINGS: Record<Framing, Shot> = {
  // Steep, so the keys in front of the low screen do not cover it.
  screen: { target: SCREEN_TOP, dir: new THREE.Vector3(0, 10.7, 2.4), fov: 12, fit: [3.6, 2.5] },
  keys: { target: new THREE.Vector3(0, 0, 0.1), dir: new THREE.Vector3(0, 30, 5.6), fov: 18, fit: [18.6, 8.4] },
  // From high up, as the product photos are: the light shows in the gaps between the caps.
  light: { target: new THREE.Vector3(0, -0.3, 0.2), dir: new THREE.Vector3(-9, 26, 17), fov: 20, fit: [19.6, 13.4] },
  // Straight from above, so painting reaches every key alike.
  paint: { target: new THREE.Vector3(0, 0, 0.1), dir: new THREE.Vector3(0, 30, 1.5), fov: 18, fit: [18.6, 8.4] },
  system: { target: new THREE.Vector3(0, -0.4, 0), dir: new THREE.Vector3(19, 7.5, 19), fov: 19, fit: [19, 8.5] },
};
const TRANSITION_S = 1;
// Moves at once and settles slowly: an ease-in start reads as lag after a click.
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

interface CameraState {
  target: THREE.Vector3;
  sph: THREE.Spherical;
  fov: number;
}

const capGeometries = new Map<number, THREE.BufferGeometry>();
function capGeometry(w: number) {
  let g = capGeometries.get(w);
  if (g) return g;
  g = new RoundedBoxGeometry(w - GAP, KEY_H, 1 - GAP, 3, 0.09);
  const inset = ((1 - GAP) * (1 - TOP_SCALE)) / 2;
  const halfW = (w - GAP) / 2;
  const halfD = (1 - GAP) / 2;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + KEY_H / 2) / KEY_H;
    pos.setX(i, pos.getX(i) * ((halfW - inset * t) / halfW));
    pos.setZ(i, pos.getZ(i) * ((halfD - inset * t) / halfD));
  }
  g.computeVertexNormals();
  capGeometries.set(w, g);
  return g;
}

/** Light on the plate: flat under the key, fading over the gap so neighbours blend. */
function poolTexture() {
  const c = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      // A rounded square: full inside 60% of the plane, smooth to nothing at the edge.
      const d = Math.max(Math.abs(x - 31.5), Math.abs(y - 31.5)) / 32;
      const v = Math.round(255 * THREE.MathUtils.smoothstep(1 - d, 0, 0.4));
      img.data.set([v, v, v, 255], (y * 64 + x) * 4);
    }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
/** How far the plate reaches past the outer keys: as far as the case's top is flat. */
const PLATE_RIM = 0.15;
/** How far a key's light reaches past its footprint, in board units. */
const SPREAD = 0.12;
/** How long an LED takes to change colour, in seconds. */
const FADE_S = 0.03;

const ATLAS_W = 2048;
interface Cell {
  x: number;
  y: number;
  w: number;
}
function packCells(widths: number[]): { cells: Cell[]; height: number } {
  let x = 0;
  let y = 0;
  const cells = widths.map((w) => {
    const cw = Math.round(128 * w);
    if (x + cw > ATLAS_W) {
      x = 0;
      y += 128;
    }
    const c = { x, y, w: cw };
    x += cw;
    return c;
  });
  return { cells, height: THREE.MathUtils.ceilPowerOfTwo(y + 128) };
}

function paintLegend(ctx: CanvasRenderingContext2D, cell: Cell, text: string, dim = false) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cell.x, cell.y, cell.w, 128);
  ctx.clip();
  ctx.clearRect(cell.x, cell.y, cell.w, 128);
  ctx.fillStyle = dim ? "rgba(255,255,255,0.28)" : "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = text.length > 6 ? 26 : text.length > 3 ? 32 : 44;
  ctx.font = `500 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText(text, cell.x + cell.w / 2, cell.y + 66, cell.w - 16);
  ctx.restore();
}

interface KeyParts {
  pos: number;
  caps: THREE.InstancedMesh;
  index: number;
  slot: number;
  x: number;
  z: number;
  y: number;
  rest: number;
  tilt: number;
  legendW: number;
  legendH: number;
  base: THREE.Color;
  ink: string;
  edited: boolean;
  /** Position across (0 left → 1 right) and down (0 back → 1 front) the board, for effects. */
  u: number;
  v: number;
  seed: number;
  row: number;
  s: number;
}

const WAKE_S = 1.1;
const tmp = new THREE.Color();

class BoardScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  keys = new Map<number, KeyParts>();
  capMeshes: THREE.InstancedMesh[] = [];
  /** The switch housings, clear plastic lit by the LED under them: the light seen between rows. */
  switchGlow!: THREE.InstancedMesh;
  switches!: THREE.InstancedMesh;
  glows!: THREE.InstancedMesh;
  legends!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  atlas!: HTMLCanvasElement;
  atlasTexture!: THREE.CanvasTexture;
  cells: Cell[] = [];
  knob: THREE.Mesh;
  pivot = new THREE.Group();
  framing: Framing = "keys";
  cam!: CameraState;
  private from: CameraState | null = null;
  private to!: CameraState;
  private transitionStart = 0;
  aspect = 2;
  tftPx = 150;
  onFrame?: () => void;
  pixelRatio = 1;
  dirty = true;
  pointer = { x: 0, y: 0, nx: 0, ny: 0 };
  selected: number | null = null;
  legendTarget = 1;
  light?: LightSetting;
  /** Colours by matrix slot, shown in the per-key mode. */
  perKey?: Rgb[];
  /** While painting, the camera stops following the pointer. */
  painting = false;
  legendOpacity = 1;
  screenTexture: THREE.CanvasTexture;
  private raf = 0;
  private disposers: (() => void)[] = [];

  constructor(host: HTMLElement, screen: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    const r = this.renderer;
    this.pixelRatio = Math.min(1.5, window.devicePixelRatio);
    r.setPixelRatio(this.pixelRatio);
    // AgX keeps the white and grey caps neutral instead of tinting them.
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 0.9;
    host.appendChild(r.domElement);
    r.domElement.style.display = "block";
    r.domElement.style.opacity = "0";
    r.domElement.style.transition = "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)";

    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.35;
    this.disposers.push(() => (env.dispose(), pmrem.dispose()));

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-5, 12, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd6ff, 0.45);
    rim.position.set(8, 3, -6);
    this.scene.add(rim);

    this.scene.add(this.pivot);
    const W = BOARD_UNITS + 1.2;
    const D = DEPTH + 1.3;

    const body = new THREE.Mesh(new RoundedBoxGeometry(W, 0.9, D, 8, 0.45), new THREE.MeshStandardMaterial({ color: 0x141517, metalness: 0.35, roughness: 0.5 }));
    body.position.y = -0.45;
    this.pivot.add(body);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(BOARD_UNITS + 2 * PLATE_RIM, 0.02, DEPTH + 2 * PLATE_RIM), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.9 }));
    plate.position.y = 0.005;
    this.pivot.add(plate);

    const switchGeo = new RoundedBoxGeometry(0.64, 0.24, 0.64, 2, 0.04);
    const switchMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.45, metalness: 0.1 });
    // Instanced: one draw per cap width, one for all switches, one for all glows, one for
    // all legends. A mesh per key meant ~300 draws a frame, too many for integrated GPUs.
    const n = X85_KEYS.length;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0 });
    const byWidth = new Map<number, typeof X85_KEYS>();
    for (const k of X85_KEYS) byWidth.set(k.w, [...(byWidth.get(k.w) ?? []), k]);
    const capMesh = new Map<number, THREE.InstancedMesh>();
    for (const [w, ks] of byWidth) {
      const mesh = new THREE.InstancedMesh(capGeometry(w), capMat, ks.length);
      mesh.userData.posAt = ks.map((k) => k.pos);
      this.capMeshes.push(mesh);
      capMesh.set(w, mesh);
      this.pivot.add(mesh);
    }
    this.switches = new THREE.InstancedMesh(switchGeo, switchMat, n);
    // The light on the plate shows only in the gaps between caps, as on the real board. Each key's
    // spreads a little past its footprint so neighbours blend, and fades out over the plate's rim:
    // a hard cut there showed as a dark square at the end of each gap along the edge.
    const pool = poolTexture();
    this.disposers.push(() => pool.dispose());
    const glowMat = new THREE.MeshBasicMaterial({ map: pool, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    glowMat.onBeforeCompile = (shader) => {
      shader.uniforms.plateHalf = { value: new THREE.Vector2(BOARD_UNITS / 2 + PLATE_RIM, DEPTH / 2 + PLATE_RIM) };
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "varying vec2 vPlate;\nvoid main() {")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vPlate = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "varying vec2 vPlate;\nuniform vec2 plateHalf;\nvoid main() {")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>\n  vec2 inside = plateHalf - abs(vPlate);\n  diffuseColor.rgb *= smoothstep(0.0, ${PLATE_RIM.toFixed(2)}, min(inside.x, inside.y));`,
        );
    };
    this.glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1 + GAP + 2 * SPREAD), glowMat, n);
    this.switchGlow = new THREE.InstancedMesh(
      switchGeo.clone().scale(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      n,
    );
    this.pivot.add(this.switches, this.glows, this.switchGlow);

    const { cells, height } = packCells(X85_KEYS.map((k) => k.w));
    this.cells = cells;
    this.atlas = Object.assign(document.createElement("canvas"), { width: ATLAS_W, height });
    this.atlasTexture = new THREE.CanvasTexture(this.atlas);
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.anisotropy = 4;
    const legendGeo = new THREE.BufferGeometry();
    legendGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    legendGeo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    legendGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    const uv = new Float32Array(n * 4 * 2);
    const index: number[] = [];
    cells.forEach((c, i) => {
      const u0 = c.x / ATLAS_W, u1 = (c.x + c.w) / ATLAS_W;
      const v1 = 1 - c.y / height, v0 = 1 - (c.y + 128) / height;
      uv.set([u0, v1, u1, v1, u0, v0, u1, v0], i * 8);
      const o = i * 4;
      index.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    });
    legendGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    legendGeo.setIndex(index);
    this.legends = new THREE.Mesh(legendGeo, new THREE.MeshStandardMaterial({ map: this.atlasTexture, vertexColors: true, transparent: true, roughness: 0.6, depthWrite: false }));
    this.legends.frustumCulled = false;
    this.pivot.add(this.legends);

    const counts = new Map<number, number>();
    X85_KEYS.forEach((k, slot) => {
      const p = at(k.x, k.w, k.y + (k.dy ?? 0));
      const caps = capMesh.get(k.w)!;
      const i = counts.get(k.w) ?? 0;
      counts.set(k.w, i + 1);
      const rest = KEY_H / 2 + 0.2 + ROW_RISE[k.y];
      const parts: KeyParts = {
        pos: k.pos, caps, index: i, slot, x: p.x, z: p.z, y: rest, rest, tilt: ROW_TILT[k.y],
        legendW: (k.w - GAP - (1 - GAP) * (1 - TOP_SCALE)) * 0.92, legendH: (1 - GAP) * TOP_SCALE * 0.92,
        base: new THREE.Color(ROW_CAP[k.y]), ink: ROW_INK[k.y], edited: false,
        ...LIGHT_POINTS.get(k.pos)!,
      };
      this.keys.set(k.pos, parts);
      caps.setColorAt(i, parts.base);
      this.placeKey(parts);
      this.switches.setMatrixAt(slot, new THREE.Matrix4().makeTranslation(p.x, 0.12, p.z));
      this.switchGlow.setMatrixAt(slot, new THREE.Matrix4().makeTranslation(p.x, 0.12, p.z));
      this.switchGlow.setColorAt(slot, new THREE.Color(0, 0, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.02, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), new THREE.Vector3(k.w + GAP + 2 * SPREAD, 1, 1));
      this.glows.setMatrixAt(slot, m);
      this.glows.setColorAt(slot, new THREE.Color(0, 0, 0));
    });

    const lightGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 16);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xd9dbde, roughness: 0.35 });
    for (const l of INDICATORS) {
      const dot = new THREE.Mesh(lightGeo, lightMat);
      dot.position.copy(at(l.x, 0, l.y)).setY(0.02);
      dot.position.z -= 0.12;
      this.pivot.add(dot);
    }

    const profile = [
      [0, 0],
      [0.47, 0],
      [0.485, 0.03],
      [0.485, 0.5],
      [0.47, 0.54],
      [0.44, 0.56],
      [0, 0.56],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const knobGeo = new THREE.LatheGeometry(profile, 160);
    const kp = knobGeo.attributes.position;
    for (let i = 0; i < kp.count; i++) {
      const y = kp.getY(i);
      if (y < 0.05 || y > 0.49) continue;
      const a = Math.atan2(kp.getZ(i), kp.getX(i));
      const k = 1 + 0.01 * Math.sign(Math.sin(a * 80));
      kp.setX(i, kp.getX(i) * k);
      kp.setZ(i, kp.getZ(i) * k);
    }
    knobGeo.computeVertexNormals();
    this.knob = new THREE.Mesh(knobGeo, new THREE.MeshStandardMaterial({ color: 0xc9cbce, metalness: 1, roughness: 0.28 }));
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6 }));
    marker.position.set(0, 0.565, -0.25);
    this.knob.add(marker);
    const knobAt = at(KNOB_SLOT.x, 1, KNOB_SLOT.y);
    this.knob.position.set(knobAt.x, 0.12, knobAt.z);
    this.knob.userData.pos = KNOB_PRESS;
    this.pivot.add(this.knob);

    const dark = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8babd, metalness: 1, roughness: 0.35 });
    const back = -D / 2;
    const usb = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.1, 3, 0.09), dark);
    usb.position.set(0, -0.42, back + 0.03);
    this.pivot.add(usb);
    for (const x of [W * 0.24, W * 0.4]) {
      const slot = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.16, 0.08, 2, 0.05), dark);
      slot.position.set(x, -0.3, back + 0.025);
      const nub = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.1, 0.1, 2, 0.03), steel);
      nub.position.set(x - 0.1, -0.3, back - 0.005);
      this.pivot.add(slot, nub);
    }

    const dongle = new THREE.Group();
    const dBody = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.26, 0.5, 4, 0.08), new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5 }));
    const dPlug = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.42), steel);
    dPlug.position.set(0, 0, -0.44);
    dongle.add(dBody, dPlug);
    dongle.position.set(W * 0.36, -0.79, back - 1.4);
    dongle.rotation.y = 0.12;
    this.pivot.add(dongle);

    const sAt = at(SCREEN_SLOT.x, 1, SCREEN_SLOT.y);
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(1 - GAP, SCREEN_H, 1 - GAP, 3, 0.04), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.28, metalness: 0.2 }));
    bezel.position.set(sAt.x, SCREEN_H / 2, sAt.z);
    this.pivot.add(bezel);
    this.screenTexture = new THREE.CanvasTexture(screen);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.magFilter = THREE.LinearFilter;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false }));
    display.rotation.x = -Math.PI / 2;
    display.position.set(sAt.x, SCREEN_H + 0.002, sAt.z);
    this.pivot.add(display);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.82),
      new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 1, roughness: 0.06, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(sAt.x, SCREEN_H + 0.006, sAt.z);
    this.pivot.add(glass);

    // A painted shadow: real-time shadow maps cost more than the whole scene on slow GPUs.
    const SH_W = 512;
    const SH_H = Math.round((SH_W * D) / W);
    const pad = 72;
    const shade = Object.assign(document.createElement("canvas"), { width: SH_W + pad * 2, height: SH_H + pad * 2 });
    // Faded by hand: canvas blur filters are not reliable everywhere.
    const sctx = shade.getContext("2d")!;
    const img = sctx.createImageData(shade.width, shade.height);
    const hx = SH_W / 2 - 14, hy = SH_H / 2 - 14, corner = 40, soft = pad * 0.9;
    for (let y = 0; y < shade.height; y++) {
      for (let x = 0; x < shade.width; x++) {
        const qx = Math.abs(x - shade.width / 2) - hx + corner;
        const qy = Math.abs(y - shade.height / 2) - hy + corner;
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
        const t = THREE.MathUtils.smoothstep(d, -soft * 0.4, soft);
        img.data[(y * shade.width + x) * 4 + 3] = Math.round(205 * (1 - t));
      }
    }
    sctx.putImageData(img, 0, 0);
    const shadowTex = new THREE.CanvasTexture(shade);
    const scale = (SH_W + pad * 2) / SH_W;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * scale, D * ((SH_H + pad * 2) / SH_H)), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0.35, -0.91, 0.45);
    this.pivot.add(floor);

    this.to = this.shot(this.framing);
    this.cam = this.copyState(this.to);
  }

  private shot(framing: Framing): CameraState {
    const f = FRAMINGS[framing];
    const half = Math.tan(THREE.MathUtils.degToRad(f.fov / 2));
    const radius = Math.max(f.fit[1] / 2 / half, f.fit[0] / 2 / (half * this.aspect));
    return { target: f.target.clone(), sph: new THREE.Spherical().setFromVector3(f.dir.clone().normalize().multiplyScalar(radius)), fov: f.fov };
  }

  private copyState(c: CameraState): CameraState {
    return { target: c.target.clone(), sph: c.sph.clone(), fov: c.fov };
  }

  setFraming(framing: Framing) {
    if (framing === this.framing && this.from === null) return;
    this.framing = framing;
    this.from = this.copyState(this.cam);
    this.to = this.shot(framing);
    this.transitionStart = performance.now();
  }

  setFaces(face: (pos: number) => KeyFace) {
    this.dirty = true;
    const ctx = this.atlas.getContext("2d")!;
    for (const [pos, k] of this.keys) {
      const f = face(pos);
      paintLegend(ctx, this.cells[k.slot], f.label, f.dim);
      k.edited = !!f.edited;
      this.inkKey(pos, k);
    }
    this.atlasTexture.needsUpdate = true;
  }

  private inkFor(pos: number, k: KeyParts) {
    if (pos === this.selected) return ROW_SELECTED[k.row];
    if (k.edited) return ROW_EDITED[k.row];
    return k.ink;
  }

  private inkKey(pos: number, k: KeyParts) {
    tmp.set(this.inkFor(pos, k));
    const colors = this.legends.geometry.attributes.color as THREE.BufferAttribute;
    for (let v = 0; v < 4; v++) colors.setXYZ(k.slot * 4 + v, tmp.r, tmp.g, tmp.b);
    colors.needsUpdate = true;
  }

  private placeKey(k: KeyParts) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(k.x, k.y, k.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), k.tilt), new THREE.Vector3(1, 1, 1));
    k.caps.setMatrixAt(k.index, m);
    k.caps.instanceMatrix.needsUpdate = true;
    const pos = this.legends.geometry.attributes.position as THREE.BufferAttribute;
    const nor = this.legends.geometry.attributes.normal as THREE.BufferAttribute;
    const hw = k.legendW / 2, hh = k.legendH / 2, top = KEY_H / 2 + 0.004;
    const corners = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
    const normal = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), k.tilt);
    corners.forEach(([x, z], v) => {
      const p = new THREE.Vector3(x, top, z).applyMatrix4(m);
      pos.setXYZ(k.slot * 4 + v, p.x, p.y, p.z);
      nor.setXYZ(k.slot * 4 + v, normal.x, normal.y, normal.z);
    });
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  setLegendsVisible(visible: boolean) {
    this.legendTarget = visible ? 1 : 0;
  }

  setSelected(pos: number | null) {
    this.selected = pos;
    this.dirty = true;
    for (const [p, k] of this.keys) this.inkKey(p, k);
  }

  /** A light wave across the keys, played once when the keyboard connects. */
  wake() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.wakeStart = performance.now();
    this.dirty = true;
  }

  private wakePhase(now: number): number | null {
    if (this.wakeStart === null) return null;
    const p = (now - this.wakeStart) / 1000 / WAKE_S;
    if (p >= 1) {
      this.wakeStart = null;
      return null;
    }
    return -0.2 + 1.4 * p;
  }

  private wakeColor(u: number, out: THREE.Color) {
    const l = this.wakeLight;
    if (l?.rainbow) out.setHSL(u * 0.85, 1, 0.5);
    else if (l && l.mode !== 0) out.setRGB(l.rgb.r / 255, l.rgb.g / 255, l.rgb.b / 255);
    else out.setRGB(0.9, 0.96, 0.97);
  }

  /** The studio effect mode 25 plays, and its loop (planned once per effect). */
  private studio?: { effect: StudioEffect; plan: LoopPlan };

  setLighting(light?: LightSetting, perKey?: Rgb[], studio?: StudioEffect) {
    this.light = light;
    this.perKey = perKey;
    if (studio !== this.studio?.effect) this.studio = studio && { effect: studio, plan: planLoop(studio) };
    this.dirty = true;
  }

  /** Each key's shown light (colour × amount), easing towards the effect's. */
  private shown = new Map<number, THREE.Color>();
  private lastLightT = 0;
  /** Some key is still easing, so frames must keep coming after the light stops. */
  private fading = false;

  private updateLight(t: number) {
    const dt = Math.max(0, Math.min(0.1, t - this.lastLightT));
    this.lastLightT = t;
    // No easing without motion (reduced motion passes t = 0) or on the first frame.
    const ease = dt > 0 ? 1 - Math.exp(-dt / FADE_S) : 1;
    this.fading = false;
    const l = this.light;
    const effect = l ? effectFor(l.mode) : undefined;
    // Mode 25 plays the stored animation: the studio's colours when Dorsal knows the effect,
    // otherwise every key dimly lit, since the keyboard cannot say what it holds.
    const studio = l?.mode === ANIMATION_MODE ? this.studio : undefined;
    const perKey = l?.mode === PER_KEY_MODE ? this.perKey : studio ? studioColours(studio.effect, studio.plan, t) : undefined;
    const unknown = l?.mode === ANIMATION_MODE && !studio;
    const cap = new THREE.Color();
    const wave = this.wakePhase(performance.now());
    for (const k of this.keys.values()) {
      let amount = 0;
      if (perKey) {
        const c = perKey[k.pos] ?? { r: 0, g: 0, b: 0 };
        tmp.setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
        amount = c.r || c.g || c.b ? l!.brightness / 4 : 0;
      } else if (unknown) {
        tmp.setRGB(1, 1, 1);
        amount = 0.25 * (l!.brightness / 4);
      } else if (l && effect) amount = lightAt(l, effect, k, t, tmp);
      if (wave !== null) {
        const w = Math.exp(-(((wave - k.u) / 0.09) ** 2));
        if (w > amount) {
          amount = w;
          this.wakeColor(k.u, tmp);
        }
      }
      const target = cap.copy(tmp).multiplyScalar(amount > 0.001 ? amount : 0);
      const shown = this.shown.get(k.pos) ?? this.shown.set(k.pos, target.clone()).get(k.pos)!;
      shown.lerp(target, ease);
      if (Math.abs(shown.r - target.r) + Math.abs(shown.g - target.g) + Math.abs(shown.b - target.b) > 0.003) this.fading = true;
      else shown.copy(target);
      // The caps keep their own colour (the legends do not shine through); the light is the plate
      // between them, close to each key. Spread wide, the keys' light ran together into a smear
      // across the plate; a bright line at each cap's foot drew a square around every key.
      this.glows.setColorAt(k.slot, cap.copy(shown).multiplyScalar(0.3));
      this.switchGlow.setColorAt(k.slot, cap.copy(shown).multiplyScalar(0.9));
    }
    this.switchGlow.instanceColor!.needsUpdate = true;
    this.glows.instanceColor!.needsUpdate = true;
    for (const m of this.capMeshes) m.instanceColor!.needsUpdate = true;
  }

  pick(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects([...this.capMeshes, this.knob], false)[0];
    if (!hit) return null;
    if (hit.object === this.knob) return this.knob.userData.pos as number;
    return (hit.object.userData.posAt as number[])[hit.instanceId ?? -1] ?? null;
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = this.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.to = this.shot(this.framing);
    if (!this.from) this.cam = this.copyState(this.to);
    // Resizing clears the canvas; drawing now keeps the next paint from showing it blank.
    this.renderer.render(this.scene, this.camera);
    this.dirty = true;
  }

  start() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let prev = t0;
    const tick = () => {
      const now = performance.now();
      const t = (now - t0) / 1000;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (this.from) {
        const p = reduce ? 1 : Math.min(1, (now - this.transitionStart) / 1000 / TRANSITION_S);
        const e = easeOut(p);
        const a = this.from;
        const b = this.to;
        this.cam.target.lerpVectors(a.target, b.target, e);
        let dTheta = b.sph.theta - a.sph.theta;
        dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
        this.cam.sph.theta = a.sph.theta + dTheta * e;
        this.cam.sph.phi = a.sph.phi + (b.sph.phi - a.sph.phi) * e;
        this.cam.sph.radius = Math.exp(Math.log(a.sph.radius) + (Math.log(b.sph.radius) - Math.log(a.sph.radius)) * e);
        this.cam.fov = a.fov + (b.fov - a.fov) * e;
        if (p >= 1) this.from = null;
      }
      const follow = 1 - Math.exp(-dt * 3.5);
      const pointerMoving = Math.abs(this.pointer.nx - this.pointer.x) + Math.abs(this.pointer.ny - this.pointer.y) > 0.0005;
      this.pointer.x += (this.pointer.nx - this.pointer.x) * follow;
      this.pointer.y += (this.pointer.ny - this.pointer.y) * follow;
      const view = this.cam.sph.clone();
      view.theta += this.pointer.x * 0.06;
      view.phi = THREE.MathUtils.clamp(view.phi + this.pointer.y * 0.035, 0.05, Math.PI / 2 - 0.05);
      this.camera.position.setFromSpherical(view).add(this.cam.target);
      this.camera.fov = this.cam.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.cam.target);
      const h = this.renderer.domElement.clientHeight || 1;
      const dist = this.camera.position.distanceTo(SCREEN_TOP);
      this.tftPx = (0.76 / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * h;
      let settling = false;
      for (const [pos, k] of this.keys) {
        const goal = k.rest + (pos === this.selected ? 0.14 : 0);
        if (Math.abs(goal - k.y) > 0.0005) {
          k.y += (goal - k.y) * (1 - Math.exp(-dt * 12));
          this.placeKey(k);
          settling = true;
        }
      }
      if (Math.abs(this.legendTarget - this.legendOpacity) > 0.002) {
        this.legendOpacity += (this.legendTarget - this.legendOpacity) * (reduce ? 1 : 1 - Math.exp(-dt * 6));
        this.legends.material.opacity = this.legendOpacity;
        this.legends.visible = this.legendOpacity > 0.01;
        settling = true;
      }
      const animating = this.lightAnimating();
      if (animating || this.lightWasOn) {
        this.updateLight(reduce ? 0 : t);
        this.lightWasOn = animating;
      }
      this.onFrame?.();

      const moving = this.from !== null || pointerMoving || settling || animating || this.dirty;
      if (moving || now - this.lastRender > 120) {
        this.screenTexture.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        if (this.renderer.domElement.style.opacity === "0") requestAnimationFrame(() => (this.renderer.domElement.style.opacity = "1"));
        // The cost of a frame shows up as the gap before the next one (the GPU or the
        // software renderer finishes the work then), so that gap is what adapts quality.
        if (moving) this.adapt(dt * 1000);
        this.lastRender = now;
        this.dirty = false;
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private lastRender = 0;
  private lightWasOn = false;
  private wakeStart: number | null = null;
  wakeLight?: LightSetting;
  private slowFrames = 0;

  private lightAnimating() {
    return this.wakeStart !== null || this.fading || (!!this.light && this.light.mode !== 0);
  }

  /** Drops the resolution when frames take too long, so motion stays smooth on slow machines. */
  private adapt(frameMs: number) {
    this.slowFrames = frameMs > 40 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 6 && this.pixelRatio > 0.5) {
      this.pixelRatio = Math.max(0.5, this.pixelRatio * 0.7);
      this.renderer.setPixelRatio(this.pixelRatio);
      const el = this.renderer.domElement;
      this.renderer.setSize(el.clientWidth, el.clientHeight, false);
      this.slowFrames = 0;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (![...capGeometries.values()].includes(o.geometry)) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material & { map?: THREE.Texture | null }) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
    this.disposers.forEach((d) => d());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export interface Board3DProps {
  screen: HTMLCanvasElement;
  framing: Framing;
  face: (pos: number) => KeyFace;
  /** Changes whenever `face` would return something different. */
  faceKey: string;
  light?: LightSetting;
  /** The design shown when `light` is in the per-key mode, by matrix slot. */
  perKey?: Rgb[];
  /** The studio effect shown when `light` is in the animation mode. */
  studio?: StudioEffect;
  /** Plays the wake wave when this turns true, in the colour of `wakeLight`. */
  ready?: boolean;
  wakeLight?: LightSetting;
  tftPx?: { current: number };
  selected?: number | null;
  legends?: boolean;
  onKey?: (pos: number) => void;
  /** Turns the board into a canvas: pointer down and drag call this for each key under the pointer. */
  onPaint?: (pos: number) => void;
  className?: string;
  children?: ReactNode;
  fallback: ReactNode;
}

export function Board3D(props: Board3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let s: BoardScene;
    try {
      s = new BoardScene(el, props.screen);
    } catch {
      setFailed(true);
      return;
    }
    scene.current = s;
    const p = latest.current;
    s.setFraming(p.framing);
    s.setSelected(p.selected ?? null);
    s.setLegendsVisible(p.legends ?? true);
    s.legendOpacity = p.legends === false ? 0 : 1;
    s.legends.material.opacity = s.legendOpacity;
    s.legends.visible = s.legendOpacity > 0.01;
    void document.fonts.ready.then(() => s.setFaces(latest.current.face));
    s.setFaces(p.face);
    s.setLighting(p.light, p.perKey, p.studio);
    s.onFrame = () => {
      if (latest.current.tftPx) latest.current.tftPx.current = s.tftPx;
    };

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) s.resize(r.width, r.height);
    });
    ro.observe(el);
    let lastPainted: number | null = null;
    const paint = (e: PointerEvent) => {
      const pos = s.pick(e.clientX, e.clientY);
      if (pos !== null && pos !== lastPainted) latest.current.onPaint?.(pos);
      lastPainted = pos;
    };
    const move = (e: PointerEvent) => {
      if (s.painting) return paint(e);
      const r = el.getBoundingClientRect();
      s.pointer.nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      s.pointer.ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const leave = () => (s.pointer.nx = s.pointer.ny = 0);
    let down: { x: number; y: number } | null = null;
    const pdown = (e: PointerEvent) => {
      if (latest.current.onPaint) {
        // Paint mode: the board holds still and every key under the pointer takes the brush.
        s.painting = true;
        s.pointer.nx = s.pointer.ny = 0;
        el.setPointerCapture(e.pointerId);
        lastPainted = null;
        return paint(e);
      }
      down = { x: e.clientX, y: e.clientY };
    };
    const pup = (e: PointerEvent) => {
      if (s.painting) {
        s.painting = false;
        return;
      }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      down = null;
      const pos = s.pick(e.clientX, e.clientY);
      if (pos !== null) latest.current.onKey?.(pos);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointerup", pup);
    s.start();
    return () => {
      ro.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointerup", pup);
      s.dispose();
      scene.current = null;
    };
  }, [props.screen]);

  useEffect(() => scene.current?.setFraming(props.framing), [props.framing]);
  useEffect(() => scene.current?.setFaces(latest.current.face), [props.faceKey]);
  useEffect(() => scene.current?.setSelected(props.selected ?? null), [props.selected]);
  useEffect(() => scene.current?.setLegendsVisible(props.legends ?? true), [props.legends]);
  useEffect(() => scene.current?.setLighting(props.light, props.perKey, props.studio), [props.light, props.perKey, props.studio]);
  const wasReady = useRef(props.ready);
  useEffect(() => {
    if (scene.current) scene.current.wakeLight = props.wakeLight;
    if (props.ready && !wasReady.current) scene.current?.wake();
    wasReady.current = props.ready;
  }, [props.ready, props.wakeLight]);

  return (
    <div ref={host} className={props.className}>
      {failed && props.fallback}
      {props.children}
    </div>
  );
}
