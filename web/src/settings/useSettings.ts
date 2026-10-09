import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  browserStore,
  DARK_QUERY,
  readSettings,
  readThemeChoice,
  resolveTheme,
  watchSystemTheme,
  writeSettings,
  writeThemeChoice,
  type RestrictionLayer,
  type Settings,
  type Theme,
  type ThemeChoice,
} from "./preferences.ts";

const subscribeSystemTheme = (onChange: () => void) => watchSystemTheme(window.matchMedia(DARK_QUERY), onChange);

/**
 * The user's preferences for this device (preferences.ts): the theme choice and the theme it resolves to, following the operating
 * system live while "System" is chosen, and the restriction layer switches. Applies the theme to <html data-theme>, as the
 * first-paint script in index.html did, so the two always agree.
 */
export function useSettings() {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => readThemeChoice(browserStore()));
  // The operating system's setting, always followed (used only while the choice is "System").
  const systemDark = useSyncExternalStore(subscribeSystemTheme, () => window.matchMedia(DARK_QUERY).matches);
  const [settings, setSettings] = useState<Settings>(() => readSettings(browserStore()));
  const theme: Theme = resolveTheme(themeChoice, systemDark);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  const chooseTheme = useCallback((choice: ThemeChoice) => {
    setThemeChoice(choice);
    // If storage is unavailable the choice still applies for this visit.
    writeThemeChoice(browserStore(), choice);
  }, []);

  const setRestriction = useCallback((layer: RestrictionLayer, on: boolean) => {
    setSettings((s) => {
      const next: Settings = { restrictions: { ...s.restrictions, [layer]: on } };
      writeSettings(browserStore(), next);
      return next;
    });
  }, []);

  return { themeChoice, theme, chooseTheme, restrictions: settings.restrictions, setRestriction };
}
