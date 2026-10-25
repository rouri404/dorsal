// The X85's screen corner in 3D. The TFT shows `screen`, a canvas the caller keeps drawing into.

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const KEY = 0.92; // a 1u keycap, with the gap to its neighbours
const KEY_H = 0.5;
const TOP_SCALE = 0.84; // keycap sculpt: the top is narrower than the base

function keycapGeometry() {
  const g = new RoundedBoxGeometry(KEY, KEY_H, KEY, 4, 0.1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + KEY_H / 2) / KEY_H;
    const k = 1 - (1 - TOP_SCALE) * t;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function legendTexture(glyph: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c9cbd0";
  ctx.font = '500 64px "IBM Plex Sans", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Screen3D({ screen, className, fallback }: { screen: HTMLCanvasElement; className?: string; fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(16, 1, 0.1, 50);
    camera.position.set(0, 5.3, 2.75);
    camera.lookAt(0, 0.3, -0.16);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2.5, 6, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(768, 768);
    key.shadow.radius = 6;
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd6ff, 0.5);
    rim.position.set(3, 2, -3);
    scene.add(rim);

    // `board` turns around the TFT; the keys are laid out with the TFT at the origin.
    const pivot = new THREE.Group();
    scene.add(pivot);
    const board = new THREE.Group();
    board.position.set(-0.5, 0, 0.5);
    pivot.add(board);

    const caseMat = new THREE.MeshStandardMaterial({ color: 0x232529, metalness: 0.75, roughness: 0.42 });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(2.36, 0.42, 2.36, 6, 0.16), caseMat);
    slab.position.y = -0.21;
    slab.castShadow = slab.receiveShadow = true;
    board.add(slab);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.02, 2.08), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.8 }));
    plate.position.y = 0.0;
    board.add(plate);

    const capMat = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.62, metalness: 0.05 });
    const capGeo = keycapGeometry();
    const legends: THREE.Texture[] = [];
    const addKey = (x: number, z: number, glyph: string) => {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, KEY_H / 2 + 0.02, z);
      cap.castShadow = cap.receiveShadow = true;
      board.add(cap);
      const tex = legendTexture(glyph);
      legends.push(tex);
      const top = KEY * TOP_SCALE * 0.82;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(top, top), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(x, KEY_H + 0.025, z);
      board.add(label);
    };
    addKey(-0.5, -0.5, "↑");
    addKey(-0.5, 0.5, "↓");
    addKey(0.5, 0.5, "→");

    const bezel = new THREE.Mesh(new RoundedBoxGeometry(KEY, 0.34, KEY, 4, 0.08), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.28, metalness: 0.2 }));
    bezel.position.set(0.5, 0.19, -0.5);
    bezel.castShadow = bezel.receiveShadow = true;
    board.add(bezel);
    const screenTex = new THREE.CanvasTexture(screen);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    // Smoothed: the real panel's pixels are too small to see as blocks.
    screenTex.magFilter = THREE.LinearFilter;
    screenTex.minFilter = THREE.LinearFilter;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    display.rotation.x = -Math.PI / 2;
    display.position.set(0.5, 0.362, -0.5);
    board.add(display);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 1, roughness: 0.06, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0.5, 0.366, -0.5);
    board.add(glass);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    scene.add(floor);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = { x: 0, y: 0 };
    const now = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      target.x = target.y = 0;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      now.x += (target.x - now.x) * 0.08;
      now.y += (target.y - now.y) * 0.08;
      const sway = reduce ? 0 : Math.sin(t * 0.6) * 0.015;
      pivot.rotation.y = -0.12 + now.x * 0.05 + sway;
      pivot.rotation.x = now.y * 0.02;
      pivot.position.y = reduce ? 0 : Math.sin(t * 0.9) * 0.025;
      screenTex.needsUpdate = true;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      legends.forEach((t) => t.dispose());
      screenTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [screen]);

  return (
    <div ref={host} className={className}>
      {failed && fallback}
    </div>
  );
}
