import { afterEach, describe, expect, it, vi } from "vitest";
import { studioJob, uploadJob } from "../src/screen/uploadJob";

describe("background jobs", () => {
  afterEach(() => {
    studioJob.dismiss();
    uploadJob.dismiss();
    vi.useRealTimers();
  });

  it("the studio's storing runs apart from the screen upload, and outlives the result a while", () => {
    vi.useFakeTimers();
    studioJob.start("Gravando");
    studioJob.progress(0.4);
    expect(studioJob.get()).toMatchObject({ status: "uploading", progress: 0.4 });
    expect(uploadJob.get().status).toBe("idle");
    studioJob.finish(true);
    studioJob.progress(0.9);
    expect(studioJob.get()).toMatchObject({ status: "success", progress: 1 });
    vi.advanceTimersByTime(5000);
    expect(studioJob.get().status).toBe("idle");
  });
});
