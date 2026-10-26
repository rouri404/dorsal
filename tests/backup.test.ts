import { describe, expect, it } from "vitest";
import { BackupError, isEmptyPlan, parseBackup, planRestore, type Backup } from "../src/backup";
import type { KeyValue } from "../src/protocol/keycodes";
import { newEffect } from "../src/studio/effect";

const keys = (n: number, at?: [number, KeyValue]): KeyValue[] => Array.from({ length: n }, (_, i) => (at && at[0] === i ? at[1] : [0, 0, 4 + (i % 20), 0]));
const light = { mode: 1, speed: 2, brightness: 4, option: 0, rainbow: false, rgb: { r: 255, g: 255, b: 255 } };
const design = (r: number) => Array.from({ length: 128 }, () => ({ r, g: 0, b: 0 }));
const perKey = [0, 1, 2, 3, 4].map(design);
const sleep = { btSeconds: 120, rfSeconds: 120, btDeepSeconds: 1680, rfDeepSeconds: 1680 };
const file = (extra: object = {}) =>
  JSON.stringify({ createdAt: "2026-10-24T12:00:00.000Z", identity: { deviceId: 3451 }, keymap: keys(128), fnKeymapWin: keys(128), light, perKey, reportRate: 4000, debounce: 0, sleep, ...extra });

describe("backup files", () => {
  it("reads a backup written by the app", () => {
    const b = parseBackup(file());
    expect(b.keymap).toHaveLength(128);
    expect(b.fnKeymap).toHaveLength(128);
    expect(b.light).toEqual(light);
    expect(b.reportRate).toBe(4000);
    expect(b.sleep).toEqual(sleep);
    expect(b.perKey).toEqual(perKey);
  });

  it("still reads a backup from before per-key colours", () => {
    const b = parseBackup(file({ perKey: undefined, sideLight: light, light: { mode: 4, speed: 2, brightness: 4, rainbow: true, rgb: { r: 1, g: 2, b: 3 } } }));
    expect(b.perKey).toBeUndefined();
    expect(b.light).toEqual({ mode: 4, speed: 2, brightness: 4, option: 0, rainbow: true, rgb: { r: 1, g: 2, b: 3 } });
    expect(b.keymap).toHaveLength(128);
  });

  it("refuses what is not a backup", () => {
    expect(() => parseBackup("not json")).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ name: "something else" }))).toThrow(BackupError);
  });

  it("refuses a backup from another keyboard", () => {
    expect(() => parseBackup(file({ identity: { deviceId: 1234 } }))).toThrowError("other-keyboard");
  });

  it("leaves out malformed parts instead of writing them", () => {
    const b = parseBackup(file({ keymap: [[0, 0, 999, 0]], light: { mode: "x" }, debounce: 300, perKey: [[{ r: 300, g: 0, b: 0 }]] }));
    expect(b.keymap).toBeUndefined();
    expect(b.light).toBeUndefined();
    expect(b.debounce).toBeUndefined();
    expect(b.perKey).toBeUndefined();
    expect(b.sleep).toEqual(sleep);
  });
});

describe("restore plan", () => {
  const backup: Backup = parseBackup(file());

  it("writes nothing when the keyboard already matches", () => {
    expect(isEmptyPlan(planRestore(backup, backup))).toBe(true);
  });

  it("writes only what differs", () => {
    const now: Backup = { ...backup, keymap: keys(128, [10, [0, 0, 0x29, 0]]), light: { ...light, mode: 5 }, sleep: { ...sleep, btSeconds: 60 } };
    const plan = planRestore(backup, now);
    expect(plan.keys).toEqual([[10, backup.keymap![10]]]);
    expect(plan.fnKeys).toEqual([]);
    expect(plan.light).toEqual(light);
    expect(plan.perKey).toEqual([]);
    expect(plan.sleep).toEqual(sleep);
    expect(plan.reportRate).toBeUndefined();
  });

  it("skips what the keyboard could not read", () => {
    const plan = planRestore(backup, { ...backup, keymap: undefined, light: undefined });
    expect(plan.keys).toEqual([]);
    expect(plan.light).toEqual(light);
  });

  it("writes only the per-key designs that differ", () => {
    const now: Backup = { ...backup, perKey: [design(0), design(9), design(2), design(3), design(8)] };
    expect(planRestore(backup, now).perKey).toEqual([
      [1, design(1)],
      [4, design(4)],
    ]);
  });

  it("writes every design when the keyboard could not read them", () => {
    expect(planRestore(backup, { ...backup, perKey: undefined }).perKey.map(([d]) => d)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("studio effects in the backup", () => {
  it("backs up the studio effects and restores the missing ones", () => {
    const kept = newEffect("Guardado");
    const fresh = newEffect("Novo");
    const b = parseBackup(file({ studio: [kept, fresh, { id: "x", name: "quebrado", layers: [{ kind: "linear" }] }] }));
    expect(b.studio).toEqual([kept, fresh]);
    const now: Backup = { ...b, studio: [kept] };
    const plan = planRestore(b, now);
    expect(plan.studio).toEqual([fresh]);
    expect(isEmptyPlan({ ...planRestore(b, b), studio: [fresh] })).toBe(false);
    expect(isEmptyPlan(planRestore(b, b))).toBe(true);
  });
});
