import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Loads NH_API_KEY from .dev.vars (git-ignored) locally. Refuses to run if .dev.vars isn't ignored. Never prints the key.
 * Without a .dev.vars file (CI), the key comes from the NH_API_KEY environment variable (a GitHub Actions secret).
 */
export function loadNhKey(): string {
  if (!existsSync(".dev.vars")) {
    const fromEnv = process.env["NH_API_KEY"]?.trim();
    if (fromEnv && fromEnv !== "replace-with-your-key") return fromEnv;
    throw new Error("Missing .dev.vars (or NH_API_KEY in the environment). Copy .dev.vars.example and set NH_API_KEY.");
  }
  try {
    execFileSync("git", ["check-ignore", "-q", ".dev.vars"]);
  } catch {
    throw new Error("Refusing to run: .dev.vars is not git-ignored.");
  }
  process.loadEnvFile(".dev.vars");
  const key = process.env["NH_API_KEY"]?.trim();
  if (!key || key === "replace-with-your-key") throw new Error("NH_API_KEY is not set in .dev.vars.");
  return key;
}

/** Fail loudly if the key appears in any saved .json file under `dir`. */
export async function assertKeyNotSaved(dir: string, key: string): Promise<void> {
  const files = await readdir(dir, { recursive: true });
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    if ((await readFile(path, "utf8")).includes(key)) throw new Error(`API key found in saved file ${path}. Delete that folder.`);
  }
}
