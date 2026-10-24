import { describe, expect, it } from "vitest";
import { BackupError, isEmptyPlan, parseBackup, planRestore, type Backup } from "../src/backup";
import type { KeyValue } from "../src/protocol/keycodes";

const keys = (n: number, at?: [number, KeyValue]): KeyValue[] => Array.from({ length: n }, (_, i) => (at && at[0] === i ? at[1] : [0, 0, 4 + (i % 20), 0]));
const light = { mode: 1, speed: 2, brightness: 4, rainbow: false, rgb: { r: 255, g: 255, b: 255 } };
const sleep = { btSeconds: 120, rfSeconds: 120, btDeepSeconds: 1680, rfDeepSeconds: 1680 };
const file = (extra: object = {}) =>
  JSON.stringify({ createdAt: "2026-10-24T12:00:00.000Z", identity: { deviceId: 3451 }, keymap: keys(128), fnKeymapWin: keys(128), light, sideLight: light, reportRate: 4000, debounce: 0, sleep, ...extra });

describe("backup files", () => {
  it("reads a backup written by the app", () => {
    const b = parseBackup(file());
    expect(b.keymap).toHaveLength(128);
    expect(b.fnKeymap).toHaveLength(128);
    expect(b.light).toEqual(light);
    expect(b.reportRate).toBe(4000);
    expect(b.sleep).toEqual(sleep);
  });

  it("refuses what is not a backup", () => {
    expect(() => parseBackup("not json")).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ name: "something else" }))).toThrow(BackupError);
  });

  it("refuses a backup from another keyboard", () => {
    expect(() => parseBackup(file({ identity: { deviceId: 1234 } }))).toThrowError("other-keyboard");
  });

  it("leaves out malformed parts instead of writing them", () => {
    const b = parseBackup(file({ keymap: [[0, 0, 999, 0]], light: { mode: "x" }, debounce: 300 }));
    expect(b.keymap).toBeUndefined();
    expect(b.light).toBeUndefined();
    expect(b.debounce).toBeUndefined();
    expect(b.sideLight).toEqual(light);
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
    expect(plan.sideLight).toBeUndefined();
    expect(plan.sleep).toEqual(sleep);
    expect(plan.reportRate).toBeUndefined();
  });

  it("skips what the keyboard could not read", () => {
    const plan = planRestore(backup, { ...backup, keymap: undefined, light: undefined });
    expect(plan.keys).toEqual([]);
    expect(plan.light).toEqual(light);
  });
});
