import { encodePacket, REPORT_ID, toHex, type Checksum } from "./packet";
import { keepAwake, sleep } from "./timer";

export const VENDOR_ID = 0x3151;
export const PRODUCT_WIRED = 0x5002;
export const PRODUCT_DONGLE = 0x5006;

/**
 * Only the cable's configuration collection. The 2.4G dongle exposes the same collection but
 * answers every configuration command with zeros, so it is never offered.
 */
export const HID_FILTERS: HIDDeviceFilter[] = [{ vendorId: VENDOR_ID, productId: PRODUCT_WIRED, usagePage: 0xffff, usage: 2 }];

export interface LogEntry {
  time: number;
  dir: "tx" | "rx" | "dry" | "err";
  hex: string;
}

export interface XferOptions {
  checksum?: Checksum;
  /** Delay before sending, like the vendor app's SEND_TIME (default 10 ms). */
  sendDelay?: number;
  /** Delay between the write and the read-back (default 10 ms). */
  readDelay?: number;
  /** Changes device state: suppressed in dry-run mode. */
  write?: boolean;
}


function isConfigCollection(d: HIDDevice): boolean {
  return d.collections.some((c) => c.usagePage === 0xffff && c.usage === 2);
}

/**
 * Serialises request/response exchanges with the keyboard. The firmware answers a
 * command by staging a 64-byte feature report that the host then reads back, so two
 * exchanges must never interleave.
 */
export class Transport {
  readonly device: HIDDevice;
  dryRun = false;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(e: LogEntry) => void>();

  constructor(device: HIDDevice) {
    this.device = device;
  }

  static supported(): boolean {
    return typeof navigator !== "undefined" && "hid" in navigator;
  }

  /** Devices this origin was already granted (no prompt). */
  static async granted(): Promise<HIDDevice[]> {
    const all = await navigator.hid.getDevices();
    return all.filter((d) => d.vendorId === VENDOR_ID && isConfigCollection(d));
  }

  static async request(): Promise<HIDDevice[]> {
    const picked = await navigator.hid.requestDevice({ filters: HID_FILTERS });
    return picked.filter(isConfigCollection);
  }

  get isWired(): boolean {
    return this.device.productId === PRODUCT_WIRED;
  }

  async open(): Promise<void> {
    if (!this.device.opened) await this.device.open();
  }

  async close(): Promise<void> {
    if (this.device.opened) await this.device.close();
  }

  onLog(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private log(dir: LogEntry["dir"], bytes: ArrayLike<number> | string) {
    const entry: LogEntry = { time: Date.now(), dir, hex: typeof bytes === "string" ? bytes : toHex(bytes) };
    this.listeners.forEach((fn) => fn(entry));
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async rawSend(packet: Uint8Array, opts: XferOptions): Promise<boolean> {
    if (opts.write && this.dryRun) {
      this.log("dry", packet);
      return true;
    }
    const delay = opts.sendDelay ?? 10;
    if (delay > 0) await sleep(delay);
    try {
      await this.device.sendFeatureReport(REPORT_ID, packet);
      this.log("tx", packet);
      return true;
    } catch (err) {
      this.log("err", `send ${toHex(packet, 8)}…: ${String(err)}`);
      return false;
    }
  }

  private async rawRead(delay: number): Promise<Uint8Array | undefined> {
    if (delay > 0) await sleep(delay);
    try {
      const view = await this.device.receiveFeatureReport(REPORT_ID);
      let data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      // Some platforms prepend the report ID; the payload is always 64 bytes.
      if (data.length === 65) data = data.slice(1);
      this.log("rx", data);
      return data;
    } catch (err) {
      this.log("err", `read: ${String(err)}`);
      return undefined;
    }
  }

  /** Sends one command without reading a reply. */
  send(cmd: ArrayLike<number>, opts: XferOptions = {}): Promise<boolean> {
    return this.exclusive(() => this.rawSend(encodePacket(cmd, opts.checksum), opts));
  }

  /** Sends one command and returns the 64-byte reply (undefined on failure or dry-run writes). */
  query(cmd: ArrayLike<number>, opts: XferOptions = {}): Promise<Uint8Array | undefined> {
    return this.exclusive(async () => {
      const packet = encodePacket(cmd, opts.checksum);
      if (!(await this.rawSend(packet, opts))) return undefined;
      if (opts.write && this.dryRun) return undefined;
      return this.rawRead(opts.readDelay ?? 10);
    });
  }

  /** Runs several exchanges back to back without other traffic in between (and keeps a background tab awake meanwhile). */
  batch<T>(fn: () => Promise<T>): Promise<T> {
    return this.exclusive(() => keepAwake(fn));
  }

  /** Raw building blocks for use inside batch(). */
  async sendInBatch(cmd: ArrayLike<number>, opts: XferOptions = {}): Promise<boolean> {
    return this.rawSend(encodePacket(cmd, opts.checksum), opts);
  }

  async queryInBatch(cmd: ArrayLike<number>, opts: XferOptions = {}): Promise<Uint8Array | undefined> {
    const packet = encodePacket(cmd, opts.checksum);
    if (!(await this.rawSend(packet, opts))) return undefined;
    if (opts.write && this.dryRun) return undefined;
    return this.rawRead(opts.readDelay ?? 10);
  }
}
