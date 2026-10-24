import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PRODUCT_DONGLE, PRODUCT_WIRED, Transport, type LogEntry } from "./hid/transport";
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
  error: ConnectError | null;
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

/** Why a connection failed (or, for not-x85, a warning on a connection that worked). */
export type ConnectError =
  | { kind: "no-cable" }
  | { kind: "dongle" }
  | { kind: "no-webhid" }
  | { kind: "no-access" }
  | { kind: "no-answer" }
  | { kind: "not-x85"; deviceId: number }
  | { kind: "other"; detail: string };

/** What to tell the person about a connection error, and what to do about it. */
export function describeConnectError(e: ConnectError, lang: "pt" | "en"): { title: string; hint: string } {
  const en = lang === "en";
  switch (e.kind) {
    case "no-cable":
      return en
        ? { title: "The X85 Pro is not plugged in by cable.", hint: "Plug in the USB cable and connect again." }
        : { title: "O X85 Pro não está ligado pelo cabo.", hint: "Ligue o cabo USB e conecte de novo." };
    case "dongle":
      return en
        ? { title: "Only the 2.4G dongle is connected.", hint: "The keyboard takes no settings over the dongle. Plug in the USB cable and connect again." }
        : { title: "Só o dongle 2.4G está conectado.", hint: "Pelo dongle o teclado não aceita configurações. Ligue o cabo USB e conecte de novo." };
    case "no-webhid":
      return en
        ? { title: "This browser cannot talk to the keyboard.", hint: "Open it in Chrome, Edge, Chromium or Brave, or use the AppImage." }
        : { title: "Este navegador não fala com o teclado.", hint: "Abra no Chrome, Edge, Chromium ou Brave, ou use o AppImage." };
    case "no-access":
      return en
        ? { title: "Linux blocked access to the keyboard.", hint: "Run the command in step 2, replug the cable and connect again." }
        : { title: "O Linux bloqueou o acesso ao teclado.", hint: "Rode o comando do passo 2, reconecte o cabo e conecte de novo." };
    case "no-answer":
      return en
        ? { title: "The keyboard did not answer.", hint: "Replug the cable, close other apps connected to it (such as qmk.top) and try again." }
        : { title: "O teclado não respondeu.", hint: "Reconecte o cabo, feche outros apps ligados a ele (como o qmk.top) e tente de novo." };
    case "not-x85":
      return en
        ? { title: "This keyboard is not an X85 Pro.", hint: `Its firmware reports ID ${e.deviceId}; some features may not work.` }
        : { title: "Este teclado não é um X85 Pro.", hint: `O firmware informa o ID ${e.deviceId}; alguns recursos podem não funcionar.` };
    case "other":
      return en ? { title: "Could not connect.", hint: e.detail } : { title: "Não deu para conectar.", hint: e.detail };
  }
}

/** Opening a hidraw device without permission fails with these. */
const isAccessError = (e: unknown) => e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError" || /failed to open/i.test(e.message));

class ConnectFailure extends Error {
  constructor(readonly reason: ConnectError) {
    super(reason.kind);
  }
}

const Ctx = createContext<DeviceState | null>(null);
const LOG_LIMIT = 400;

/** `parts` limits what is read on connect (the mini screen app needs none of the settings). */
export function DeviceProvider({ children, parts = Object.keys(READERS) as SnapshotKey[] }: { children: ReactNode; parts?: SnapshotKey[] }) {
  const [kb, setKb] = useState<X85 | null>(null);
  const kbRef = useRef<X85 | null>(null);
  kbRef.current = kb;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<ConnectError | null>(null);
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
      try {
        await t.open();
      } catch (e) {
        throw new ConnectFailure(isAccessError(e) ? { kind: "no-access" } : { kind: "other", detail: e instanceof Error ? e.message : String(e) });
      }
      unsubscribe.current?.();
      unsubscribe.current = t.onLog((e) => setLog((l) => (l.length >= LOG_LIMIT ? [...l.slice(-LOG_LIMIT + 1), e] : [...l, e])));
      const k = new X85(t);
      // A keyboard just plugged in can miss the first command; ask twice before giving up.
      const id = (await k.identity()) ?? (await new Promise((r) => setTimeout(r, 150)).then(() => k.identity()));
      if (!id) {
        await t.close().catch(() => undefined);
        throw new ConnectFailure({ kind: "no-answer" });
      }
      if (id.deviceId !== X85_DEVICE_ID) setError({ kind: "not-x85", deviceId: id.deviceId });
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

  // One connection attempt at a time. Plugging the cable in fires a "connect" event per USB
  // interface, the Connect button can be pressed during a silent reconnect, and opening a
  // device that is already being opened fails ("An operation that changes the device state is
  // in progress"): later callers wait for the attempt in progress instead.
  const attaching = useRef<Promise<void> | null>(null);
  const attach = useCallback(
    (devices: HIDDevice[]) => {
      if (attaching.current) return attaching.current;
      const attempt = (async () => {
        // Only the cable: the dongle answers no configuration command (it replies with zeros).
        const cable = devices.find((d) => d.productId === PRODUCT_WIRED);
        if (cable) await attachTransport(new Transport(cable));
        else if (devices.some((d) => d.productId === PRODUCT_DONGLE)) throw new ConnectFailure({ kind: "dongle" });
        // The AppImages pick the device themselves: nothing picked means no cable is plugged in.
        else if (navigator.userAgent.includes("Electron")) throw new ConnectFailure({ kind: "no-cable" });
      })().finally(() => {
        attaching.current = null;
      });
      attaching.current = attempt;
      return attempt;
    },
    [attachTransport],
  );

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      if (!Transport.supported()) throw new ConnectFailure({ kind: "no-webhid" });
      // Closing the browser's chooser picks nothing: not an error.
      await attach(await Transport.request());
    } catch (e) {
      if (e instanceof ConnectFailure) setError(e.reason);
      else if (e instanceof DOMException && e.name === "NotFoundError") setError(null);
      else if (isAccessError(e)) setError({ kind: "no-access" });
      else setError({ kind: "other", detail: e instanceof Error ? e.message : String(e) });
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
    // Reconnects to a keyboard granted before; a device appearing while one is connected
    // (the dongle waking up, say) must not reset the connection in use.
    const tryGranted = () => {
      if (kbRef.current) return;
      Transport.granted()
        .then((d) => (d.some((x) => x.productId === PRODUCT_WIRED) ? attach(d) : undefined))
        .catch((e) => e instanceof ConnectFailure && setError(e.reason));
    };
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
  /** `done` is what to say when it works, as a whole sentence ("Lighting applied"). */
  const run = useCallback(
    async (done: string, fn: () => Promise<boolean | void>) => {
      const en = lang === "en";
      setBusy(true);
      setStatus(null);
      try {
        const ok = (await fn()) !== false;
        setStatus({ ok, text: ok ? done : en ? "The keyboard did not confirm. Try again." : "O teclado não confirmou. Tente de novo." });
        return ok;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        setStatus({ ok: false, text: `${en ? "It did not work" : "Não deu certo"}: ${detail}` });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [lang],
  );
  return { busy, status, run };
}
