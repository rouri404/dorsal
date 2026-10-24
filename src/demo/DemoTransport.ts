// Demo mode (?demo): replays responses captured from a real X85 Pro over USB, so the
// app can be shown, reviewed and screenshotted without a keyboard. Writes are kept in
// memory only and update what later reads return.

import type { LogEntry, Transport, XferOptions } from "../hid/transport";
import { encodePacket, toHex } from "../hid/packet";
import capture from "./x85-capture.json";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
const pages = (s: string) => Array.from({ length: 8 }, (_, i) => hex(s).slice(i * 64, i * 64 + 64));

export class DemoTransport {
  readonly device = { productId: 0x5002, productName: "Gaming Keyboard (demo)" } as unknown as HIDDevice;
  readonly isWired = true;
  dryRun = false;
  private listeners = new Set<(e: LogEntry) => void>();
  private keymap = pages(capture.keymatrix_p0);
  private fn = pages(capture.fn_win_p0);
  private replies = new Map<number, Uint8Array>([
    [0x8f, hex(capture.usbver_8f)],
    [0x83, hex(capture.report_83)],
    [0x84, hex(capture.profile_84)],
    [0x85, hex(capture.ledonoff_85)],
    [0x86, hex(capture.debounce_86)],
    [0x87, hex(capture.ledparam_87)],
    [0x88, hex(capture.sled_88)],
    [0x91, hex(capture.sleep_91)],
    [0xad, hex(capture.oled_ad)],
  ]);

  async open() {}
  async close() {}

  onLog(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private log(dir: LogEntry["dir"], bytes: ArrayLike<number>) {
    const e: LogEntry = { time: Date.now(), dir, hex: toHex(bytes) };
    this.listeners.forEach((l) => l(e));
  }

  /** Mirrors the few writes whose effect a later read should show. */
  private applyWrite(p: Uint8Array) {
    const setSlot = (store: Uint8Array[], pos: number) => store[Math.floor(pos / 16)].set(p.slice(8, 12), (pos % 16) * 4);
    if (p[0] === 0x0a) setSlot(this.keymap, p[2]);
    if (p[0] === 0x10) setSlot(this.fn, p[3]);
    if (p[0] === 0x07 || p[0] === 0x08) this.replies.set(p[0] | 0x80, p.slice());
  }

  private async exchange(cmd: ArrayLike<number>, opts: XferOptions, read: boolean): Promise<Uint8Array | undefined> {
    const packet = encodePacket(cmd, opts.checksum);
    this.log(opts.write && this.dryRun ? "dry" : "tx", packet);
    await new Promise((r) => setTimeout(r, opts.sendDelay ?? 4));
    if (opts.write && !this.dryRun) this.applyWrite(packet);
    if (!read) return packet;
    let reply: Uint8Array | undefined;
    if (packet[0] === 0x8a) reply = this.keymap[packet[3]];
    else if (packet[0] === 0x90) reply = this.fn[packet[4]];
    else if (packet[0] === 0xa5) reply = Uint8Array.from([0xa5, 1, ...new Array(62).fill(0)]);
    else reply = this.replies.get(packet[0]) ?? packet; // the firmware echoes what it does not know
    this.log("rx", reply);
    return reply;
  }

  send(cmd: ArrayLike<number>, opts: XferOptions = {}) {
    return this.exchange(cmd, opts, false).then(() => true);
  }
  query(cmd: ArrayLike<number>, opts: XferOptions = {}) {
    return this.exchange(cmd, opts, true);
  }
  batch<T>(fn: () => Promise<T>) {
    return fn();
  }
  sendInBatch(cmd: ArrayLike<number>, opts: XferOptions = {}) {
    return this.send(cmd, opts);
  }
  queryInBatch(cmd: ArrayLike<number>, opts: XferOptions = {}) {
    return this.query(cmd, opts);
  }

  asTransport(): Transport {
    return this as unknown as Transport;
  }
}

export const isDemo = () => new URLSearchParams(window.location.search).has("demo");
