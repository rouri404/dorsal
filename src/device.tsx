import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Transport, type LogEntry } from "./hid/transport";
import { X85, X85_DEVICE_ID, type Identity, type LightSetting, type ScreenInfo, type SleepSetting } from "./protocol/x85";
import type { KeyValue } from "./protocol/keycodes";
import { DemoTransport, isDemo } from "./demo/DemoTransport";
import { useLang } from "./i18n";

/** Everything readable from the keyboard, fetched once on connect and kept in sync after writes. */
export interface Snapshot {
  screen?: ScreenInfo;
  profile?: number;
  powerSave?: boolean;
  reportRate?: number;
  debounce?: number;
  sleep?: SleepSetting;
  light?: LightSetting;
  sideLight?: LightSetting;
  keymap?: KeyValue[];
  fnKeymap?: KeyValue[];
}
export type SnapshotKey = keyof Snapshot;

const READERS: { [K in SnapshotKey]: (kb: X85) => Promise<Snapshot[K]> } = {
  // Order matters: what the first tabs show is read first.
  keymap: (kb) => kb.keymap(0, 0),
  light: (kb) => kb.light(),
  sideLight: (kb) => kb.sideLight(),
  reportRate: (kb) => kb.reportRate(),
  debounce: (kb) => kb.debounce(),
  sleep: (kb) => kb.sleep(),
  screen: (kb) => kb.screenInfo(),
  profile: (kb) => kb.profile(),
  powerSave: (kb) => kb.powerSave(),
  fnKeymap: (kb) => kb.fnKeymap(0, 0),
};

interface DeviceState {
  kb: X85 | null;
  identity: Identity | null;
  snapshot: Snapshot;
  /** True until the first full read after connecting finishes. */
  loading: boolean;
  connecting: boolean;
  error: string | null;
  dryRun: boolean;
  log: LogEntry[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Re-reads some (or all) parts from the keyboard. */
  refresh: (...keys: SnapshotKey[]) => Promise<void>;
  /** Updates the cache after a successful write, without another read. */
  patch: (p: Partial<Snapshot>) => void;
  setDryRun: (v: boolean) => void;
  clearLog: () => void;
}

const Ctx = createContext<DeviceState | null>(null);
const LOG_LIMIT = 400;

/** `parts` limits what is read on connect (the mini screen app needs none of the settings). */
export function DeviceProvider({ children, parts = Object.keys(READERS) as SnapshotKey[] }: { children: ReactNode; parts?: SnapshotKey[] }) {
  const lang = useLang();
  const langRef = useRef(lang);
  langRef.current = lang;
  const tr = (pt: string, en: string) => (langRef.current === "en" ? en : pt);
  const [kb, setKb] = useState<X85 | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRunState] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const unsubscribe = useRef<(() => void) | null>(null);
  const dryRunRef = useRef(dryRun);
  const partsRef = useRef(parts);

  const readParts = useCallback(async (k: X85, keys: SnapshotKey[]) => {
    for (const key of keys) {
      const value = await READERS[key](k);
      // Publish each part as soon as it arrives so the UI fills in progressively.
      setSnapshot((s) => ({ ...s, [key]: value }));
    }
  }, []);

  const attachTransport = useCallback(
    async (t: Transport) => {
      t.dryRun = dryRunRef.current;
      await t.open();
      unsubscribe.current?.();
      unsubscribe.current = t.onLog((e) => setLog((l) => (l.length >= LOG_LIMIT ? [...l.slice(-LOG_LIMIT + 1), e] : [...l, e])));
      const k = new X85(t);
      const id = await k.identity();
      if (!id) throw new Error(tr("O teclado não respondeu ao comando de identificação (0x8F).", "The keyboard did not answer the identify command (0x8F)."));
      if (id.deviceId !== X85_DEVICE_ID) {
        setError(tr(`Dispositivo ${id.deviceId} não é o X85 Pro (3451). Os recursos podem não funcionar.`, `Device ${id.deviceId} is not the X85 Pro (3451). Features may not work.`));
      }
      setSnapshot({});
      setIdentity(id);
      setKb(k);
      setLoading(true);
      try {
        await readParts(k, partsRef.current);
      } finally {
        setLoading(false);
      }
    },
    [readParts],
  );

  const attach = useCallback(
    async (devices: HIDDevice[]) => {
      // Prefer the cable: the screen only accepts uploads over USB.
      const device = devices.find((d) => d.productId === 0x5002) ?? devices[0];
      if (device) await attachTransport(new Transport(device));
    },
    [attachTransport],
  );

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      if (!Transport.supported()) throw new Error(tr("Este navegador não tem WebHID. Use Chrome, Chromium, Edge, Brave ou o AppImage.", "This browser has no WebHID. Use Chrome, Chromium, Edge, Brave or the AppImage."));
      await attach(await Transport.request());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, [attach]);

  const disconnect = useCallback(async () => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    await kb?.t.close();
    setKb(null);
    setIdentity(null);
    setSnapshot({});
  }, [kb]);

  const refresh = useCallback(
    async (...keys: SnapshotKey[]) => {
      if (!kb) return;
      await readParts(kb, keys.length ? keys : (Object.keys(READERS) as SnapshotKey[]));
    },
    [kb, readParts],
  );

  const patch = useCallback((p: Partial<Snapshot>) => setSnapshot((s) => ({ ...s, ...p })), []);

  // Reconnect silently to a keyboard this origin was granted before.
  useEffect(() => {
    if (isDemo()) {
      void attachTransport(new DemoTransport().asTransport());
      return;
    }
    if (!Transport.supported()) return;
    const tryGranted = () =>
      Transport.granted()
        .then((d) => {
          if (d.length) void attach(d);
        })
        .catch(() => undefined);
    tryGranted();
    const onDisconnect = (e: HIDConnectionEvent) => {
      setKb((cur) => {
        if (cur && cur.t.device === e.device) {
          setIdentity(null);
          setSnapshot({});
          return null;
        }
        return cur;
      });
    };
    navigator.hid.addEventListener("disconnect", onDisconnect);
    navigator.hid.addEventListener("connect", tryGranted);
    return () => {
      navigator.hid.removeEventListener("disconnect", onDisconnect);
      navigator.hid.removeEventListener("connect", tryGranted);
    };
  }, [attach, attachTransport]);

  const setDryRun = useCallback(
    (v: boolean) => {
      dryRunRef.current = v;
      setDryRunState(v);
      if (kb) kb.t.dryRun = v;
    },
    [kb],
  );

  const value = useMemo<DeviceState>(
    () => ({ kb, identity, snapshot, loading, connecting, error, dryRun, log, connect, disconnect, refresh, patch, setDryRun, clearLog: () => setLog([]) }),
    [kb, identity, snapshot, loading, connecting, error, dryRun, log, connect, disconnect, refresh, patch, setDryRun],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevice(): DeviceState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDevice fora do DeviceProvider");
  return v;
}

/** Runs a keyboard action and reports the outcome as a short status line. */
export function useAction() {
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async (label: string, fn: () => Promise<boolean | void>) => {
    setBusy(true);
    setStatus(null);
    try {
      const ok = (await fn()) !== false;
      setStatus({ ok, text: ok ? `${label}: ok` : `${label}: ${lang === "en" ? "the keyboard did not confirm" : "o teclado não confirmou"}` });
      return ok;
    } catch (e) {
      setStatus({ ok: false, text: `${label}: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, status, run };
}
