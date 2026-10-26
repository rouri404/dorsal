// The music engine: hears a sound source, turns it into the keyboard's 42 bars and streams them
// every 20 ms. Global, like the upload jobs: it goes on when another tab is opened, and the
// configurator stops it when the keyboard goes away.

import { useSyncExternalStore } from "react";
import { sleep } from "../hid/timer";
import type { X85 } from "../protocol/x85";
import { BANDS, bandBins, bandLevels, createMeter, toHeights } from "./bands";
import { setLiveBars } from "./live";

/** Where the sound comes from: the computer's output, a browser tab, or an input. */
export type MusicSource = "system" | "tab" | "input";

/** Why hearing did not start, for the page to put in words. */
export type MusicError = "denied" | "no-tab-audio" | "no-system-source" | "no-input" | "failed";

export interface MusicState {
  status: "off" | "starting" | "on" | "error";
  source?: MusicSource;
  error?: MusicError;
  detail?: string;
}

declare global {
  interface Window {
    /** Set by the AppImage's preload: what only the desktop app can do. */
    dorsal?: {
      music?: {
        start(): Promise<{ ok: boolean; error?: string }>;
        stop(): Promise<void>;
        /** Tells the tray whether the music is on, and from which source, to resume it. */
        state(on: boolean, source?: { source: MusicSource; deviceId?: string }): void;
        /** The tray's "Stop the music". */
        onStopRequest(fn: () => void): void;
      };
      /** Whether closing the window keeps Dorsal in the tray. */
      tray?(): Promise<boolean>;
      /** Quits the app (the tray's music, when there is nothing to play). */
      quit?(): void;
      settings?: {
        get(): Promise<AppSettings>;
        set(next: AppSettingsChange): Promise<void>;
      };
    };
  }
}

/** The AppImage's own settings, kept by its main process. */
export interface AppSettings {
  /** At login, the app starts in the tray and plays the last music. */
  musicAtLogin: boolean;
  /** Only an AppImage knows its own path, which the login entry runs. */
  canAutostart: boolean;
  tray: boolean;
  /** Closing the window with the music on leaves it playing from the tray. */
  closeToTray: boolean;
  lang: "system" | "pt" | "en";
  /** The last music source played. */
  music: { source: MusicSource; deviceId?: string } | null;
  /** Opened from the tray while the music played there: it goes on here. */
  resume: boolean;
}

/** The settings the app's card changes. */
export type AppSettingsChange = Partial<Pick<AppSettings, "musicAtLogin" | "closeToTray" | "lang">>;

/**
 * In the AppImage, which sets up the computer's sound itself. On the site it comes from the input
 * that music.sh sets up once.
 */
export const inDesktopApp = () => typeof window !== "undefined" && !!window.dorsal?.music;

/** The vendor's driver sends a frame every 20 ms. */
const FRAME_MS = 20;
const FFT = 4096;
/** The name of the computer's sound: the AppImage's remap source, or music.sh's input. */
const SYSTEM_LABEL = "Dorsal";
const RAW_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

let state: MusicState = { status: "off" };
const listeners = new Set<() => void>();
/** The source of the music now playing, for the AppImage to resume it. */
let playing: { source: MusicSource; deviceId?: string } | undefined;
function emit(next: MusicState) {
  if ((next.status === "on") !== (state.status === "on")) window.dorsal?.music?.state(next.status === "on", next.status === "on" ? playing : undefined);
  state = next;
  listeners.forEach((l) => l());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const musicState = () => state;
export const useMusic = (): MusicState => useSyncExternalStore(subscribe, musicState, musicState);

/** Where the frames go: the keyboard, and whether its light is in a music mode right now. */
let target: { kb: X85; listening: boolean } | null = null;
export function setMusicTarget(kb: X85 | null, listening: boolean) {
  target = kb ? { kb, listening } : null;
}

class StartError extends Error {
  constructor(readonly code: MusicError, detail?: string) {
    super(detail ?? code);
  }
}

async function findInput(label: string, tries = 15): Promise<string | undefined> {
  for (let i = 0; i < tries; i++) {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    const hit = inputs.find((d) => d.label.includes(label));
    if (hit) return hit.deviceId;
    // A source loaded a moment ago takes a little while to be listed.
    await sleep(200);
  }
  return undefined;
}

async function openSource(source: MusicSource, deviceId?: string): Promise<MediaStream> {
  if (source === "system") {
    let id: string | undefined;
    if (window.dorsal?.music) {
      const r = await window.dorsal.music.start();
      if (!r.ok) throw new StartError("no-system-source", r.error);
      id = await findInput(SYSTEM_LABEL);
    } else {
      // Inputs have no names until one is opened: the first one, then closed, unlocks them.
      (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
      id = await findInput(SYSTEM_LABEL, 1);
    }
    if (!id) throw new StartError("no-system-source");
    return navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id }, ...RAW_AUDIO } });
  }
  if (source === "tab") {
    // Chrome shares a tab's sound only along with its picture; the picture is dropped at once.
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: RAW_AUDIO });
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) throw new StartError("no-tab-audio");
    return stream;
  }
  return navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), ...RAW_AUDIO } });
}

/** The audio inputs the browser lists (names show once access to one was granted). */
export async function audioInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId !== "");
}

let session: { stop: () => Promise<void> } | null = null;

export async function startMusic(source: MusicSource, deviceId?: string): Promise<void> {
  await stopMusic();
  playing = { source, ...(deviceId ? { deviceId } : {}) };
  emit({ status: "starting", source });
  let stream: MediaStream;
  try {
    stream = await openSource(source, deviceId);
  } catch (e) {
    if (source === "system") await window.dorsal?.music?.stop();
    const code: MusicError = e instanceof StartError ? e.code : e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : e instanceof DOMException && e.name === "NotFoundError" ? "no-input" : "failed";
    emit({ status: "error", source, error: code, detail: e instanceof Error ? e.message : String(e) });
    return;
  }

  const ctx = new AudioContext();
  // Opened after a wait for the picker, the context may start suspended.
  await ctx.resume().catch(() => undefined);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT;
  analyser.smoothingTimeConstant = 0;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const bins = bandBins(ctx.sampleRate, FFT);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const meter = createMeter();

  let running = true;
  let inflight = false;
  const stop = async () => {
    if (!running) return;
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    setLiveBars(null);
    await ctx.close().catch(() => undefined);
    if (source === "system") await window.dorsal?.music?.stop();
    // Leaves the keys dark rather than frozen on the last frame.
    if (target?.listening) await target.kb.music(new Array(BANDS).fill(0));
  };
  session = { stop };
  // Sharing stopped from the browser's own bar ends the music too.
  stream.getAudioTracks().forEach((t) => t.addEventListener("ended", () => void stopMusic()));
  emit({ status: "on", source });

  void (async () => {
    let last = performance.now();
    while (running) {
      const now = performance.now();
      analyser.getFloatFrequencyData(spectrum);
      const heights = toHeights(meter(bandLevels(spectrum, bins, ctx.sampleRate, FFT), (now - last) / 1000));
      last = now;
      setLiveBars(heights);
      // A frame still waiting behind another write is not followed by more: no backlog.
      if (target?.listening && !inflight) {
        inflight = true;
        void target.kb.music(heights).finally(() => (inflight = false));
      }
      await sleep(Math.max(1, FRAME_MS - (performance.now() - now)));
    }
  })();
}

if (typeof window !== "undefined") {
  window.dorsal?.music?.onStopRequest(() => void stopMusic());
  // On the site, the music lives in the tab: closing it is confirmed, and the keys are left dark
  // rather than frozen on the last frame (best effort: the page may go before the packet does).
  if (!window.dorsal) {
    window.addEventListener("beforeunload", (e) => {
      if (state.status === "on") e.preventDefault();
    });
    window.addEventListener("pagehide", () => {
      if (state.status === "on" && target?.listening) void target.kb.music(new Array(BANDS).fill(0));
    });
  }
}

/** In the AppImage, opened from the tray while the music played there, goes on playing it. */
export async function resumeMusic(): Promise<void> {
  const s = await window.dorsal?.settings?.get();
  if (s?.resume && s.music && state.status === "off") await startMusic(s.music.source, s.music.deviceId);
}

export async function stopMusic(): Promise<void> {
  const s = session;
  session = null;
  if (s) await s.stop();
  if (state.status !== "off") emit({ status: "off" });
}
