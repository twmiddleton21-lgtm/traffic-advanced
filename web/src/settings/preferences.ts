import * as z from "zod";

/**
 * User preferences, kept on this device only (localStorage) and never sent anywhere. No location, ever.
 *
 * Theme: "ta-theme" holds "light" or "dark" for an explicit choice, and is ABSENT for "system". That is exactly what the inline
 * first-paint script in web/index.html reads (a missing key means follow the system), so the script and its CSP hash stay unchanged.
 * Never write any other value to "ta-theme": the script would read it as light.
 *
 * Everything else lives in "ta-settings-v1", validated on read: a missing, damaged or partly invalid value falls back to the
 * defaults field by field, and storage that is unavailable (private mode, blocked site data) simply means defaults for this visit.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "ta-theme";
export const SETTINGS_KEY = "ta-settings-v1";

/** The parts of Storage used here, so tests can pass a stand-in and a missing or throwing store is handled in one place. */
export type PreferenceStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage, or null when the browser refuses access (reading the property itself can throw). */
export function browserStore(): PreferenceStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readThemeChoice(store: PreferenceStore | null): ThemeChoice {
  try {
    const saved = store?.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice; "system" removes the key. Returns false when it couldn't be saved (the choice still applies for this visit). */
export function writeThemeChoice(store: PreferenceStore | null, choice: ThemeChoice): boolean {
  try {
    if (!store) return false;
    if (choice === "system") store.removeItem(THEME_KEY);
    else store.setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

export const resolveTheme = (choice: ThemeChoice, systemDark: boolean): Theme => (choice === "system" ? (systemDark ? "dark" : "light") : choice);

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Follows the operating system's light/dark setting. Returns the unsubscribe function. */
export function watchSystemTheme(media: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">, onChange: (dark: boolean) => void): () => void {
  const listener = (e: { matches: boolean }) => onChange(e.matches);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** The road restriction layers. Every one is off until the user switches it on. */
export const RESTRICTION_LAYERS = ["height", "weight", "lez", "ulez"] as const;
export type RestrictionLayer = (typeof RESTRICTION_LAYERS)[number];

const off = z.boolean().catch(false);
const settingsSchema = z.object({
  restrictions: z.object({ height: off, weight: off, lez: off, ulez: off }).catch({ height: false, weight: false, lez: false, ulez: false }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = { restrictions: { height: false, weight: false, lez: false, ulez: false } };

export function readSettings(store: PreferenceStore | null): Settings {
  try {
    const raw = store?.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Saves only the known fields. Returns false when storage is unavailable. */
export function writeSettings(store: PreferenceStore | null, settings: Settings): boolean {
  try {
    if (!store) return false;
    const { height, weight, lez, ulez } = settings.restrictions;
    store.setItem(SETTINGS_KEY, JSON.stringify({ restrictions: { height, weight, lez, ulez } }));
    return true;
  } catch {
    return false;
  }
}
