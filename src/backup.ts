// Backups: the file "Download backup" writes, read back and compared with the keyboard so that
// restoring only writes what differs.

import { sameValue, type KeyValue } from "./protocol/keycodes";
import { X85_DEVICE_ID, type LightSetting, type SleepSetting, type X85 } from "./protocol/x85";

/** What a backup restores (the screen image cannot be read back, so it is not in the file). */
export interface Backup {
  keymap?: KeyValue[];
  fnKeymap?: KeyValue[];
  light?: LightSetting;
  sideLight?: LightSetting;
  reportRate?: number;
  debounce?: number;
  sleep?: SleepSetting;
}

/** The writes a restore needs, each only when the keyboard differs from the backup. */
export interface RestorePlan {
  keys: [number, KeyValue][];
  fnKeys: [number, KeyValue][];
  light?: LightSetting;
  sideLight?: LightSetting;
  reportRate?: number;
  debounce?: number;
  sleep?: SleepSetting;
}

export class BackupError extends Error {
  constructor(readonly reason: "not-json" | "not-backup" | "other-keyboard") {
    super(reason);
  }
}

const isByte = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255;
const isMatrix = (v: unknown): v is KeyValue[] => Array.isArray(v) && v.length > 0 && v.every((k) => Array.isArray(k) && k.length === 4 && k.every(isByte));
const isLight = (v: unknown): v is LightSetting => {
  const l = v as LightSetting;
  return !!l && [l.mode, l.speed, l.brightness].every(isByte) && typeof l.rainbow === "boolean" && !!l.rgb && [l.rgb.r, l.rgb.g, l.rgb.b].every(isByte);
};
const isSleep = (v: unknown): v is SleepSetting => {
  const s = v as SleepSetting;
  return !!s && [s.btSeconds, s.rfSeconds, s.btDeepSeconds, s.rfDeepSeconds].every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff);
};
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** Reads a backup file; anything malformed is left out rather than written to the keyboard. */
export function parseBackup(text: string): Backup {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("not-json");
  }
  if (!data || typeof data !== "object" || !("createdAt" in data)) throw new BackupError("not-backup");
  const id = (data.identity as { deviceId?: unknown } | null)?.deviceId;
  if (id !== undefined && id !== X85_DEVICE_ID) throw new BackupError("other-keyboard");
  const backup: Backup = {
    keymap: isMatrix(data.keymap) ? data.keymap : undefined,
    fnKeymap: isMatrix(data.fnKeymapWin) ? data.fnKeymapWin : undefined,
    light: isLight(data.light) ? data.light : undefined,
    sideLight: isLight(data.sideLight) ? data.sideLight : undefined,
    reportRate: isCount(data.reportRate) ? data.reportRate : undefined,
    debounce: isByte(data.debounce) ? (data.debounce as number) : undefined,
    sleep: isSleep(data.sleep) ? data.sleep : undefined,
  };
  if (Object.values(backup).every((v) => v === undefined)) throw new BackupError("not-backup");
  return backup;
}

const differ = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
const keyDiff = (want: KeyValue[] | undefined, have: KeyValue[] | undefined): [number, KeyValue][] =>
  want && have ? want.flatMap((v, pos) => (pos < have.length && !sameValue(v, have[pos]) ? [[pos, v] as [number, KeyValue]] : [])) : [];

/** Compares a backup with what the keyboard holds now. */
export function planRestore(backup: Backup, now: Backup): RestorePlan {
  const pick = <K extends "light" | "sideLight" | "reportRate" | "debounce" | "sleep">(k: K) => (backup[k] !== undefined && differ(backup[k], now[k]) ? backup[k] : undefined);
  return {
    keys: keyDiff(backup.keymap, now.keymap),
    fnKeys: keyDiff(backup.fnKeymap, now.fnKeymap),
    light: pick("light"),
    sideLight: pick("sideLight"),
    reportRate: pick("reportRate"),
    debounce: pick("debounce"),
    sleep: pick("sleep"),
  };
}

export const isEmptyPlan = (p: RestorePlan) => !p.keys.length && !p.fnKeys.length && [p.light, p.sideLight, p.reportRate, p.debounce, p.sleep].every((v) => v === undefined);

/** Reads what a backup covers, fresh from the keyboard. */
export async function readCurrent(kb: X85): Promise<Backup> {
  return {
    keymap: await kb.keymap(0, 0),
    fnKeymap: await kb.fnKeymap(0, 0),
    light: await kb.light(),
    sideLight: await kb.sideLight(),
    reportRate: await kb.reportRate(),
    debounce: await kb.debounce(),
    sleep: await kb.sleep(),
  };
}

/** Writes the plan; stops at the first write the keyboard does not confirm. */
export async function applyRestore(kb: X85, p: RestorePlan): Promise<boolean> {
  if (p.reportRate !== undefined && !(await kb.setReportRate(p.reportRate))) return false;
  if (p.debounce !== undefined && !(await kb.setDebounce(p.debounce))) return false;
  if (p.sleep && !(await kb.setSleep(p.sleep))) return false;
  if (p.light && !(await kb.setLight(p.light))) return false;
  if (p.sideLight && !(await kb.setSideLight(p.sideLight))) return false;
  for (const [pos, v] of p.keys) if (!(await kb.setKey(pos, v))) return false;
  for (const [pos, v] of p.fnKeys) if (!(await kb.setFnKey(pos, v))) return false;
  return true;
}
