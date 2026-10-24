// Global state of the screen upload, so its progress stays visible on every tab.

import { useSyncExternalStore } from "react";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadJob {
  status: UploadStatus;
  progress: number; // 0..1
  label: string;
  error?: string;
}

const IDLE: UploadJob = { status: "idle", progress: 0, label: "" };
let job: UploadJob = IDLE;
const listeners = new Set<() => void>();
let clearTimer: ReturnType<typeof setTimeout> | undefined;

function emit(next: UploadJob) {
  job = next;
  listeners.forEach((l) => l());
}

export const uploadJob = {
  get: () => job,
  start(label: string) {
    clearTimeout(clearTimer);
    emit({ status: "uploading", progress: 0, label });
  },
  progress(p: number) {
    if (job.status === "uploading") emit({ ...job, progress: p });
  },
  finish(ok: boolean, error?: string) {
    emit({ ...job, status: ok ? "success" : "error", progress: ok ? 1 : job.progress, error });
    // Results linger long enough to be noticed from another tab.
    clearTimer = setTimeout(() => emit(IDLE), ok ? 5000 : 10000);
  },
  dismiss() {
    clearTimeout(clearTimer);
    emit(IDLE);
  },
};

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useUploadJob(): UploadJob {
  return useSyncExternalStore(subscribe, uploadJob.get, uploadJob.get);
}
