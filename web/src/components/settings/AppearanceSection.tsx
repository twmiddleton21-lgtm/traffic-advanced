import type { ThemeChoice } from "../../settings/preferences.ts";
import { SettingsSection } from "./SettingsSection.tsx";

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follows your device's light or dark setting" },
  { value: "light", label: "Light", hint: "" },
  { value: "dark", label: "Dark", hint: "" },
];

/** Theme (System, Light, Dark) and the map style. Satellite isn't offered until a free, licensed imagery source is confirmed. */
export function AppearanceSection({ theme, onTheme }: { theme: ThemeChoice; onTheme: (t: ThemeChoice) => void }) {
  return (
    <SettingsSection title="Appearance">
      <fieldset>
        <legend className="mb-1 font-bold">Theme</legend>
        <div className="space-y-1">
          {THEMES.map((t) => (
            <label key={t.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[4px] px-2 hover:bg-raised has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-motorway">
              <input type="radio" name="ta-theme" value={t.value} checked={theme === t.value} onChange={() => onTheme(t.value)} className="size-5 accent-motorway" />
              <span>
                <span className="block">{t.label}</span>
                {t.hint && <span className="block text-[13px] text-muted">{t.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-[14px]">
        <span className="font-bold">Map:</span> Standard map
      </p>
    </SettingsSection>
  );
}
