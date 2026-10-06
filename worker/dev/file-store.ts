import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { WritableStore } from "../src/store.ts";

/**
 * Local stand-in for the R2 snapshot bucket: one file per key under `root` (default data/published, git-ignored). Node only,
 * used by the publisher and the dev/preview server. Never part of the Worker bundle.
 */
export const DEFAULT_PUBLISHED_DIR = "data/published";

export function fileStore(root: string = DEFAULT_PUBLISHED_DIR): WritableStore {
  const base = resolve(root);
  const path = (key: string) => {
    const full = resolve(join(base, key));
    if (!full.startsWith(base + sep)) throw new Error(`Store key escapes the store: ${key}`);
    return full;
  };
  return {
    async get(key) {
      try {
        const text = await readFile(path(key), "utf8");
        return { text: () => Promise.resolve(text) };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async put(key, value) {
      await mkdir(dirname(path(key)), { recursive: true });
      await writeFile(path(key), value);
    },
  };
}
