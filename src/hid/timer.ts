// Waits between HID packets. A hidden tab clamps main-thread timers to about one per
// second, so the hundreds of 1 ms pauses in a screen upload would stretch it to minutes
// (measured: 100 × 1 ms took 97 s hidden). Timers inside a dedicated worker are not
// throttled, so the waits run there when workers exist.

let worker: Worker | null | undefined;
const pending = new Map<number, () => void>();
let nextId = 0;

function timerWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const src = "onmessage = (e) => setTimeout(() => postMessage(e.data[0]), e.data[1]);";
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = (e: MessageEvent<number>) => {
      pending.get(e.data)?.();
      pending.delete(e.data);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const w = typeof Worker === "undefined" ? null : timerWorker();
    if (!w) {
      setTimeout(resolve, ms);
      return;
    }
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage([id, ms]);
  });
}

/**
 * Runs `fn` holding a Web Lock: Chrome does not freeze or discard a background tab
 * that holds one, so a long upload is not paused halfway.
 */
export function keepAwake<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request("x85-hid-transfer", fn) : fn();
}
