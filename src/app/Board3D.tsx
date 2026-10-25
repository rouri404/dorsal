// The X85 Pro in 3D, built from the physical layout in src/layout/x85.ts.

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BOARD_ROWS, BOARD_UNITS, INDICATORS, KNOB_PRESS, KNOB_SLOT, SCREEN_SLOT, X85_KEYS } from "../layout/x85";
import type { LightSetting } from "../protocol/x85";

export type Framing = "screen" | "keys" | "light" | "system";

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
const SCREEN_TOP = at(SCREEN_SLOT.x, 1, SCREEN_SLOT.y).setY(0.62);
const FRAMINGS: Record<Framing, Shot> = {
  screen: { target: SCREEN_TOP, dir: new THREE.Vector3(0, 10.7, 4.6), fov: 12, fit: [3.6, 2.5] },
  keys: { target: new THREE.Vector3(0, 0, 0.1), dir: new THREE.Vector3(0, 30, 5.6), fov: 18, fit: [18.6, 8.4] },
  light: { target: new THREE.Vector3(0, -0.3, 0.2), dir: new THREE.Vector3(-13, 15, 25), fov: 20, fit: [19, 10.8] },
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

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
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

type Effect =
  | "static" | "breathe" | "neon" | "wave" | "ripple" | "raindrop" | "snake" | "reactive" | "converge" | "sine"
  | "kaleido" | "lines" | "laser" | "circle" | "rainbow" | "rain" | "meteor" | "reactiveOff" | "train" | "fireworks";
const EFFECT_OF: Record<number, Effect> = {
  1: "static", 2: "breathe", 3: "neon", 4: "wave", 5: "ripple", 6: "raindrop", 7: "snake", 8: "reactive", 9: "converge",
  10: "sine", 11: "kaleido", 12: "lines", 14: "laser", 15: "circle", 16: "rainbow", 17: "rain", 18: "meteor",
  19: "reactiveOff", 23: "train", 24: "fireworks",
};
const SIDE_EFFECT_OF: Record<number, Effect> = { 1: "static", 2: "breathe", 3: "neon", 4: "wave", 5: "snake" };
const WAKE_S = 1.1;
const tmp = new THREE.Color();
const frac = (x: number) => x - Math.floor(x);
const hash = (n: number) => frac(Math.sin(n * 12.9898 + 78.233) * 43758.5453);

interface LightPoint {
  u: number;
  v: number;
  row: number;
  s: number;
  seed: number;
}

function lightAt(l: LightSetting, effect: Effect, p: LightPoint, t: number, out: THREE.Color): number {
  const sp = 0.35 + l.speed * 0.4;
  const { u, v, row, s, seed } = p;
  const d = Math.hypot(u - 0.5, (v - 0.5) * 0.45);
  let hue = u * 0.85;
  let amount = 1;
  let ownHue = false;
  switch (effect) {
    case "breathe":
      amount = 0.1 + 0.9 * (0.5 - 0.5 * Math.cos(t * sp * 2.2));
      break;
    case "neon":
      hue = t * sp * 0.08;
      ownHue = true;
      break;
    case "wave": {
      const phase = u - t * sp * 0.35;
      hue = phase;
      if (!l.rainbow) amount = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2 * 1.3));
      break;
    }
    case "ripple":
      hue = d * 1.6 - t * sp * 0.3;
      amount = 0.12 + 0.88 * Math.pow(0.5 + 0.5 * Math.cos((d * 4 - t * sp * 0.9) * Math.PI * 2), 3);
      break;
    case "raindrop":
    case "reactive":
    case "reactiveOff": {
      const clock = t * sp * (effect === "raindrop" ? 0.5 : 0.7) + hash(seed) * 20;
      const event = Math.floor(clock);
      const on = hash(seed * 7.1 + event) < (effect === "raindrop" ? 0.14 : 0.07);
      const fade = on ? Math.pow(1 - frac(clock), effect === "raindrop" ? 1.5 : 2.5) : 0;
      amount = effect === "reactiveOff" ? 1 - fade : fade;
      hue = hash(seed + event * 3.3);
      break;
    }
    case "snake": {
      const dist = frac(t * sp * 0.07 - s);
      amount = dist < 0.07 ? 1 - dist / 0.07 : 0;
      hue = s * 3;
      break;
    }
    case "converge": {
      const head = 1 - frac(t * sp * 0.3);
      amount = Math.max(0, 1 - Math.abs(Math.abs(u - 0.5) * 2 - head) * 5);
      hue = head;
      break;
    }
    case "sine": {
      const target = 0.5 + 0.38 * Math.sin(u * Math.PI * 2 * 1.2 - t * sp * 1.6);
      amount = Math.max(0, 1 - Math.abs(v - target) * 4.5);
      hue = u - t * 0.1;
      break;
    }
    case "kaleido":
      hue = Math.atan2((v - 0.5) * 0.45, u - 0.5) / (Math.PI * 2) + t * sp * 0.15 + d;
      ownHue = true;
      break;
    case "lines": {
      const clock = t * sp * 1.2;
      const lit = Math.floor(clock) % 6;
      amount = row === lit ? 1 : row === (lit + 5) % 6 ? (1 - frac(clock)) * 0.6 : 0.04;
      hue = row / 6;
      break;
    }
    case "laser": {
      const x = 1 - Math.abs(1 - 2 * frac(t * sp * 0.18));
      amount = Math.max(0, 1 - Math.abs(u - x) * 10);
      hue = x;
      break;
    }
    case "circle":
      amount = 0.08 + 0.92 * Math.pow(0.5 + 0.5 * Math.cos((d * 5 - t * sp * 1.2) * Math.PI * 2), 4);
      hue = d * 2 - t * 0.2;
      break;
    case "rainbow":
      hue = u + v * 0.3 - t * sp * 0.12;
      ownHue = true;
      break;
    case "rain": {
      const col = Math.round(u * 16);
      const head = frac(t * sp * 0.35 + hash(col) * 5) * 1.4;
      const dist = head - v;
      amount = dist > 0 && dist < 0.4 ? 1 - dist / 0.4 : 0;
      hue = hash(col + 9);
      break;
    }
    case "meteor": {
      const head = frac(t * sp * 0.25 + hash(row + 2) * 3) * 1.5;
      const dist = head - u;
      amount = dist > 0 && dist < 0.4 ? Math.pow(1 - dist / 0.4, 2) : 0;
      hue = u;
      break;
    }
    case "train":
      amount = frac(u * 2.5 - t * sp * 0.4 + row * 0.17) < 0.35 ? 1 : 0.04;
      hue = row / 6;
      break;
    case "fireworks": {
      const clock = t * sp * 0.4;
      const burst = Math.floor(clock);
      const phase = frac(clock);
      const dist = Math.hypot(u - (0.1 + hash(burst) * 0.8), (v - (0.1 + hash(burst + 3) * 0.8)) * 0.45);
      amount = Math.max(0, 1 - Math.abs(dist - phase * 0.45) * 14) * (1 - phase);
      hue = hash(burst + 5);
      break;
    }
  }
  if (l.rainbow || ownHue) out.setHSL(frac(hue), 0.85, 0.55);
  else out.setRGB(l.rgb.r / 255, l.rgb.g / 255, l.rgb.b / 255, THREE.SRGBColorSpace);
  return amount * (l.brightness / 4);
}

class BoardScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  keys = new Map<number, KeyParts>();
  capMeshes: THREE.InstancedMesh[] = [];
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
  strip!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  stripU!: Float32Array;
  light?: LightSetting;
  sideLight?: LightSetting;
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

    // A ring rather than a thin rounded box, whose square corners stuck out past the case.
    const ring = roundedRect(W + 0.03, D + 0.03, 0.46);
    ring.holes.push(roundedRect(W - 0.12, D - 0.12, 0.38));
    const stripGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.07, bevelEnabled: false, curveSegments: 16 });
    stripGeo.rotateX(-Math.PI / 2);
    stripGeo.translate(0, -0.035, 0);
    const count = stripGeo.attributes.position.count;
    stripGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.strip.position.y = -0.5;
    this.pivot.add(this.strip);
    const sp = stripGeo.attributes.position;
    this.stripU = new Float32Array(count);
    for (let i = 0; i < count; i++) this.stripU[i] = frac(Math.atan2(sp.getZ(i) / D, sp.getX(i) / W) / (Math.PI * 2) + 0.5);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(BOARD_UNITS + 0.1, 0.02, DEPTH + 0.1), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.9 }));
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
    this.glows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1 + GAP),
      new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      n,
    );
    this.pivot.add(this.switches, this.glows);

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
        u: (k.x + k.w / 2) / BOARD_UNITS, v: (k.y + 0.5) / BOARD_ROWS, seed: k.pos + 1, row: k.y, s: 0,
      };
      this.keys.set(k.pos, parts);
      caps.setColorAt(i, parts.base);
      this.placeKey(parts);
      this.switches.setMatrixAt(slot, new THREE.Matrix4().makeTranslation(p.x, 0.12, p.z));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.02, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), new THREE.Vector3(k.w + GAP, 1, 1));
      this.glows.setMatrixAt(slot, m);
      this.glows.setColorAt(slot, new THREE.Color(0, 0, 0));
    });

    const path = [...this.keys.values()].sort((a, b) => a.row - b.row || (a.row % 2 ? b.u - a.u : a.u - b.u));
    path.forEach((k, i) => (k.s = i / path.length));

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
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(1 - GAP, 0.62, 1 - GAP, 4, 0.08), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.28, metalness: 0.2 }));
    bezel.position.set(sAt.x, 0.31, sAt.z);
    this.pivot.add(bezel);
    this.screenTexture = new THREE.CanvasTexture(screen);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.magFilter = THREE.LinearFilter;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false }));
    display.rotation.x = -Math.PI / 2;
    display.position.set(sAt.x, 0.622, sAt.z);
    this.pivot.add(display);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.82),
      new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 1, roughness: 0.06, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(sAt.x, 0.626, sAt.z);
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
    if (l?.rainbow) out.setHSL(u * 0.85, 0.85, 0.55);
    else if (l && l.mode !== 0) out.setRGB(l.rgb.r / 255, l.rgb.g / 255, l.rgb.b / 255);
    else out.setRGB(0.9, 0.96, 0.97);
  }

  setLighting(main?: LightSetting, side?: LightSetting) {
    this.light = main;
    this.sideLight = side;
    this.dirty = true;
  }

  private updateLight(t: number) {
    const l = this.light;
    const effect = l && l.mode !== 0 ? EFFECT_OF[l.mode] ?? "static" : null;
    const cap = new THREE.Color();
    const wave = this.wakePhase(performance.now());
    for (const k of this.keys.values()) {
      let amount = l && effect ? lightAt(l, effect, k, t, tmp) : 0;
      if (wave !== null) {
        const w = Math.exp(-(((wave - k.u) / 0.09) ** 2));
        if (w > amount) {
          amount = w;
          this.wakeColor(k.u, tmp);
        }
      }
      this.glows.setColorAt(k.slot, cap.copy(tmp).multiplyScalar(amount > 0.001 ? 0.1 + 0.45 * amount : 0));
      k.caps.setColorAt(k.index, cap.copy(k.base).lerp(tmp, amount > 0.001 ? 0.12 * amount : 0));
    }
    this.glows.instanceColor!.needsUpdate = true;
    for (const m of this.capMeshes) m.instanceColor!.needsUpdate = true;

    const s = this.sideLight;
    const sideEffect = s && s.mode !== 0 ? SIDE_EFFECT_OF[s.mode] ?? "static" : null;
    const colors = this.strip.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i++) {
      const u = this.stripU[i];
      const amount = s && sideEffect ? lightAt(s, sideEffect, { u, v: 0.5, row: 0, s: u, seed: i }, t, tmp) : 0;
      if (amount <= 0) colors.setXYZ(i, 0.02, 0.02, 0.025);
      else colors.setXYZ(i, tmp.r * (0.15 + amount), tmp.g * (0.15 + amount), tmp.b * (0.15 + amount));
    }
    colors.needsUpdate = true;
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
    return this.wakeStart !== null || (!!this.light && this.light.mode !== 0) || (!!this.sideLight && this.sideLight.mode !== 0);
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
  sideLight?: LightSetting;
  /** Plays the wake wave when this turns true, in the colour of `wakeLight`. */
  ready?: boolean;
  wakeLight?: LightSetting;
  tftPx?: { current: number };
  selected?: number | null;
  legends?: boolean;
  onKey?: (pos: number) => void;
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
    s.setLighting(p.light, p.sideLight);
    s.onFrame = () => {
      if (latest.current.tftPx) latest.current.tftPx.current = s.tftPx;
    };

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) s.resize(r.width, r.height);
    });
    ro.observe(el);
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      s.pointer.nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      s.pointer.ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const leave = () => (s.pointer.nx = s.pointer.ny = 0);
    let down: { x: number; y: number } | null = null;
    const pdown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const pup = (e: PointerEvent) => {
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
  useEffect(() => scene.current?.setLighting(props.light, props.sideLight), [props.light, props.sideLight]);
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
