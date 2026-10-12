import { describe, expect, it } from "vitest";
import { readBuildInfo } from "./build-info.ts";

const at = new Date("2026-10-09T10:00:00Z");

describe("build info", () => {
  it("records the commit, a clean tree and the build time", () => {
    const git = (args: string[]) => (args[0] === "rev-parse" ? "9e243b46c5e9\n" : "");
    expect(readBuildInfo(git, at)).toEqual({ commit: "9e243b46c5e9", dirty: false, builtAt: "2026-10-09T10:00:00.000Z" });
  });

  it("flags uncommitted changes to tracked files", () => {
    const git = (args: string[]) => (args[0] === "rev-parse" ? "9e243b46c5e9" : " M web/src/App.tsx\n");
    expect(readBuildInfo(git, at).dirty).toBe(true);
  });

  it("says unknown, rather than guessing, without Git or with unexpected output", () => {
    expect(readBuildInfo(() => { throw new Error("git not found"); }, at)).toMatchObject({ commit: "unknown", dirty: false });
    expect(readBuildInfo(() => "fatal: not a git repository", at).commit).toBe("unknown");
  });
});
