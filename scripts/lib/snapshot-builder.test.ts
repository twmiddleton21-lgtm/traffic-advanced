import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertCompleteCapture } from "./snapshot-builder.ts";

/** Synthetic manifests shaped like scripts/lib/capture-store.ts output (problems + entries with record counts). */
const tempDirs: string[] = [];
function captureWith(manifest: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ta-capture-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}
// Runs even when a test fails, so no ta-capture-* folders are left behind.
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("partial upstream failure", () => {
  it("accepts a complete capture", async () => {
    await expect(assertCompleteCapture(captureWith({ problems: [], entries: [{ file: "s4/diversion-routes.json", records: 2326, expectedRecords: 2326 }] }))).resolves.toBeUndefined();
  });

  it("refuses a capture that logged a problem", async () => {
    await expect(assertCompleteCapture(captureWith({ problems: [{ source: "S1", error: "HTTP 500" }], entries: [] }))).rejects.toThrow(/1 problem/);
  });

  it("refuses a capture with fewer records than the source reported", async () => {
    await expect(assertCompleteCapture(captureWith({ problems: [], entries: [{ file: "s4/diversion-routes.json", records: 1000, expectedRecords: 2326 }] }))).rejects.toThrow(
      /1000 of 2326/,
    );
  });

  it("accepts the real Day-1 captures' manifests as complete", async () => {
    // Only the manifests are read; the captures themselves are git-ignored and may be absent on other machines.
    for (const dir of ["data/raw/2026-10-05T1140Z-open", "data/raw/2026-10-05T1208Z-nh-api"]) {
      const exists = existsSync(join(dir, "manifest.json"));
      if (exists) await expect(assertCompleteCapture(dir)).resolves.toBeUndefined();
    }
  });
});
