// The AppImage's music in the tray (background.html, loaded with no window and no GPU): only the
// keyboard and the sound, with no React and no 3D board. It plays the last source while the
// keyboard's light is in a music mode, and asks the app to quit when there is nothing to play.

import { PRODUCT_WIRED, Transport } from "../hid/transport";
import { X85 } from "../protocol/x85";
import { isMusicMode } from "../protocol/effects";
import { DemoTransport, isDemo } from "../demo/DemoTransport";
import { musicState, setMusicTarget, startMusic } from "./engine";

/** How often the light is read again: switched off the music modes on the keyboard, the music ends. */
const CHECK_MS = 10_000;

const quit = () => window.dorsal?.quit?.();

async function openKeyboard(): Promise<X85 | null> {
  let t: Transport;
  if (isDemo()) t = new DemoTransport().asTransport();
  else {
    const cable = (await Transport.granted()).find((d) => d.productId === PRODUCT_WIRED);
    if (!cable) return null;
    t = new Transport(cable);
  }
  await t.open();
  return new X85(t);
}

async function run() {
  const settings = await window.dorsal?.settings?.get();
  const kb = await openKeyboard().catch(() => null);
  const mode = (await kb?.light())?.mode ?? -1;
  if (!kb || !settings?.music || !isMusicMode(mode)) return quit();
  setMusicTarget(kb, true);
  await startMusic(settings.music.source, settings.music.deviceId);
  if (musicState().status !== "on") return quit();
  navigator.hid.addEventListener("disconnect", (e) => e.device === kb.t.device && quit());
  setInterval(async () => {
    const light = await kb.light();
    if (light && !isMusicMode(light.mode)) quit();
  }, CHECK_MS);
}

void run();
