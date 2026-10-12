import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  readSettings,
  readThemeChoice,
  resolveTheme,
  SETTINGS_KEY,
  THEME_KEY,
  watchSystemTheme,
  writeSettings,
  writeThemeChoice,
  type PreferenceStore,
  type ThemeChoice,
} from "./preferences.ts";

function memoryStore(initial: Record<string, string> = {}): PreferenceStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}
const throwing: PreferenceStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("theme preference", () => {
  it("is System when nothing is saved, and when the saved value is unknown", () => {
    expect(readThemeChoice(memoryStore())).toBe("system");
    expect(readThemeChoice(memoryStore({ [THEME_KEY]: "sepia" }))).toBe("system");
    expect(readThemeChoice(memoryStore({ [THEME_KEY]: "dark" }))).toBe("dark");
  });

  it("System removes the key; Light and Dark save exactly 'light' or 'dark'", () => {
    const store = memoryStore({ [THEME_KEY]: "dark" });
    writeThemeChoice(store, "system");
    expect(store.data.has(THEME_KEY)).toBe(false);
    writeThemeChoice(store, "light");
    expect(store.data.get(THEME_KEY)).toBe("light");
  });

  it("survives storage that is missing or throws: System for reading, and the choice still applies for this visit", () => {
    expect(readThemeChoice(null)).toBe("system");
    expect(readThemeChoice(throwing)).toBe("system");
    expect(writeThemeChoice(throwing, "dark")).toBe(false);
    expect(writeThemeChoice(null, "dark")).toBe(false);
  });

  it("System follows the operating system; Light and Dark ignore it", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows operating-system changes while subscribed, and stops when unsubscribed", () => {
    let listener: ((e: { matches: boolean }) => void) | undefined;
    const media = {
      matches: false,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => (listener = l),
      removeEventListener: () => (listener = undefined),
    } as unknown as MediaQueryList;
    const seen: boolean[] = [];
    const stop = watchSystemTheme(media, (dark) => seen.push(dark));
    listener?.({ matches: true });
    listener?.({ matches: false });
    stop();
    expect(seen).toEqual([true, false]);
    expect(listener).toBeUndefined();
  });
});

describe("first-paint theme (the inline script in web/index.html, run as the browser would)", () => {
  const html = readFileSync("web/index.html", "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
  const firstPaint = (store: PreferenceStore | null, systemDark: boolean) => {
    const documentElement = { dataset: {} as Record<string, string> };
    const localStorage = store ?? {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    runInNewContext(script, { localStorage, window: { matchMedia: () => ({ matches: systemDark }) }, document: { documentElement } });
    return documentElement.dataset["theme"];
  };

  it("paints exactly the theme the app then resolves, for every choice and system setting", () => {
    for (const choice of ["system", "light", "dark"] as ThemeChoice[]) {
      for (const systemDark of [true, false]) {
        const store = memoryStore();
        writeThemeChoice(store, choice);
        expect(firstPaint(store, systemDark), `${choice}, system ${systemDark ? "dark" : "light"}`).toBe(resolveTheme(choice, systemDark));
      }
    }
  });

  it("falls back to dark when storage throws, as it always has", () => {
    expect(firstPaint(null, false)).toBe("dark");
  });
});

describe("restriction layer preferences", () => {
  it("are all off by default, and when nothing or something unreadable is saved", () => {
    expect(DEFAULT_SETTINGS.restrictions).toEqual({ height: false, weight: false, lez: false, ulez: false });
    expect(readSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStore({ [SETTINGS_KEY]: "{not json" }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStore({ [SETTINGS_KEY]: '"a string"' }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keep valid choices and reset only the invalid fields", () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ restrictions: { height: true, weight: "yes", lez: true } }) });
    expect(readSettings(store).restrictions).toEqual({ height: true, weight: false, lez: true, ulez: false });
  });

  it("round-trip, saving only the known fields (nothing else, and never a location)", () => {
    const store = memoryStore();
    const settings = { restrictions: { height: true, weight: false, lez: false, ulez: true }, lat: 51.5 } as unknown as typeof DEFAULT_SETTINGS;
    expect(writeSettings(store, settings)).toBe(true);
    expect(JSON.parse(store.data.get(SETTINGS_KEY)!)).toEqual({ restrictions: { height: true, weight: false, lez: false, ulez: true } });
    expect(readSettings(store).restrictions).toEqual({ height: true, weight: false, lez: false, ulez: true });
    expect(writeSettings(throwing, DEFAULT_SETTINGS)).toBe(false);
  });

  it("the defaults are never shared objects that a caller could change by accident", () => {
    const a = readSettings(null);
    a.restrictions.height = true;
    expect(DEFAULT_SETTINGS.restrictions.height).toBe(false);
  });
});
