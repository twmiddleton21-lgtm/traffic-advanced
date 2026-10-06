import type { WritableStore } from "./store.ts";

/** In-memory snapshot store for tests (same interface as the R2 binding and the local file store). */
export function memoryStore(initial: Record<string, string> = {}): WritableStore & { objects: Map<string, string> } {
  const objects = new Map(Object.entries(initial));
  return {
    objects,
    get: (key) => {
      const text = objects.get(key);
      return Promise.resolve(text === undefined ? null : { text: () => Promise.resolve(text) });
    },
    put: (key, value) => Promise.resolve(void objects.set(key, value)),
  };
}
