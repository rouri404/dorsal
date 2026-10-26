// Global state of the long writes to the keyboard (the screen upload, the studio effect), so their
// progress stays visible on every tab and switching tabs never loses track of them.

import { useSyncExternalStore } from "react";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadJob {
  status: UploadStatus;
  progress: number; // 0..1
  label: string;
  error?: string;
}

const IDLE: UploadJob = { status: "idle", progress: 0, label: "" };

function createJob() {
  let job: UploadJob = IDLE;
  const listeners = new Set<() => void>();
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  function emit(next: UploadJob) {
    job = next;
    listeners.forEach((l) => l());
  }

  const api = {
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

  return [api, (): UploadJob => useSyncExternalStore(subscribe, api.get, api.get)] as const;
}

export const [uploadJob, useUploadJob] = createJob();
/** The studio effect being stored on the keyboard (mode 25). */
export const [studioJob, useStudioJob] = createJob();
