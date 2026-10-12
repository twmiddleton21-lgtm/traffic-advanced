/**
 * The app build's identity, stamped into the bundle at build time (vite.config.ts `define`): the Git commit it was built from,
 * whether the working tree had uncommitted changes, and when it was built. It identifies a build; it is never used to decide that
 * an update exists (that comes from the service worker finding a new app version, web/src/app/updates.ts).
 */
export interface BuildInfo {
  /** Short commit hash, or "unknown" when Git isn't available (for example, building from a source archive). */
  commit: string;
  /** True when the build included uncommitted changes, so the commit alone doesn't describe it. */
  dirty: boolean;
  /** ISO time of the build. */
  builtAt: string;
}

/** `git` runs a Git command and returns its output, or throws. Injected so this is testable without a repository. */
export function readBuildInfo(git: (args: string[]) => string, now: Date = new Date()): BuildInfo {
  const builtAt = now.toISOString();
  try {
    const commit = git(["rev-parse", "--short=12", "HEAD"]).trim();
    if (!/^[0-9a-f]{7,40}$/.test(commit)) return { commit: "unknown", dirty: false, builtAt };
    return { commit, dirty: git(["status", "--porcelain", "--untracked-files=no"]).trim() !== "", builtAt };
  } catch {
    return { commit: "unknown", dirty: false, builtAt };
  }
}
